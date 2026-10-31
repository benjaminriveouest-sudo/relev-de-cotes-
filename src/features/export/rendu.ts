import type { Annotations, Croquis, Photo, Point } from '../../models/types'
import { angleLisible, arcAngle, boiteTournee, distance, placerEtiquette, type Boite } from '../annotation/geometry'
import { COULEUR, COULEUR_MANQUANTE, ECART_TEXTE_ARC, RAYON_ARC, texteAngle, texteCote } from '../annotation/shapes'
import { dessinerFeuille } from '../croquis/feuille'
import type { ImagePdf } from './pdf'

/** Côté le plus long d'une image dans le PDF : net à l'impression, fichier raisonnable. */
const TAILLE_MAX = 1600
/** Un plan garde plus de pixels : ses petits textes doivent rester lisibles une fois imprimés. */
const TAILLE_MAX_PLAN = 3200
const QUALITE_JPEG = 0.85

/**
 * Taille des cotes et repères selon la taille de l'image : les tailles de l'éditeur
 * (en pixels écran) sont multipliées pour rester lisibles une fois l'image posée sur une page A4.
 */
const facteur = (largeur: number, hauteur: number) => Math.max(largeur, hauteur) / 1000
/** Sur un plan, les cotes sont plus discrètes : environ 7 points sur une page A4, comme les cotes de l'architecte. */
const facteurPlan = (largeur: number, hauteur: number) => Math.max(largeur, hauteur) / 2300

async function chargerImage(blob: Blob): Promise<{ img: HTMLImageElement; liberer: () => void }> {
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  try {
    await img.decode()
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
  return { img, liberer: () => URL.revokeObjectURL(url) }
}

function nouveauCanvas(largeur: number, hauteur: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(largeur)
  canvas.height = Math.round(hauteur)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('dessin impossible sur cet appareil')
  return { canvas, ctx }
}

/** Encode en JPEG puis libère la mémoire du canvas (important sur iPhone). */
async function versJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALITE_JPEG))
  canvas.width = 0
  canvas.height = 0
  if (!blob) throw new Error("conversion de l'image impossible")
  return new Uint8Array(await blob.arrayBuffer())
}

function rectangleArrondi(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, h: number, r: number) {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, l, h, r)
  else ctx.rect(x, y, l, h)
}

/** Ligne avec une pointe à chaque bout, comme les flèches de l'éditeur. */
function fleche(ctx: CanvasRenderingContext2D, a: Point, b: Point, epaisseur: number, longueur: number, largeur: number, couleur: string) {
  const d = distance(a, b)
  if (d < 1) return
  const u = { x: (b.x - a.x) / d, y: (b.y - a.y) / d }
  ctx.strokeStyle = couleur
  ctx.fillStyle = couleur
  ctx.lineWidth = epaisseur
  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  for (const [p, sens] of [[b, 1], [a, -1]] as const) {
    const base = { x: p.x - u.x * longueur * sens, y: p.y - u.y * longueur * sens }
    const n = { x: -u.y * (largeur / 2), y: u.x * (largeur / 2) }
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(base.x + n.x, base.y + n.y)
    ctx.lineTo(base.x - n.x, base.y - n.y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}

/** Ligne brisée (points à plat x1, y1, x2, y2…). */
function polyligne(ctx: CanvasRenderingContext2D, points: number[], epaisseur: number, couleur: string) {
  ctx.strokeStyle = couleur
  ctx.lineWidth = epaisseur
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  ctx.beginPath()
  for (let i = 0; i + 1 < points.length; i += 2) ctx.lineTo(points[i], points[i + 1])
  ctx.stroke()
}

/** Apparence des cotes dans le PDF : sur une photo, comme à l'écran ; sur un plan, fine et sans halo, comme un plan coté. */
interface Style {
  trait: string
  halo: string | null
  epaisseur: number
  fond: string
  bord: string | null
  texte: string
  manquante: string
}

const STYLE_PHOTO: Style = { trait: COULEUR, halo: '#000', epaisseur: 3, fond: '#000', bord: null, texte: COULEUR, manquante: COULEUR_MANQUANTE }
const STYLE_PLAN: Style = { trait: '#0B57D0', halo: null, epaisseur: 2, fond: '#fff', bord: '#0B57D0', texte: '#0B57D0', manquante: '#D32F2F' }

/** Étiquette prévue : ses places possibles, de la meilleure à la moins bonne. */
interface Etiquette {
  texte: string
  places: (l: number, h: number) => Point[]
  rotation: number
  manquante: boolean
}

/** Places le long d'une cote : au milieu, puis plus loin ; à côté du trait si le texte ne tient pas dessus. */
function placesCote(a: Point, b: Point, k: number) {
  return (l: number, h: number) => {
    const d = distance(a, b)
    const n = d > 0 ? { x: -(b.y - a.y) / d, y: (b.x - a.x) / d } : { x: 0, y: -1 }
    const ecarts = d < l + 30 * k ? [1.4, -1.4, 0] : [0, 1.4, -1.4]
    return ecarts.flatMap((e) =>
      [0.5, 0.35, 0.65, 0.2, 0.8].map((t) => ({
        x: a.x + (b.x - a.x) * t + n.x * e * h,
        y: a.y + (b.y - a.y) * t + n.y * e * h,
      })),
    )
  }
}

/** Places autour d'un arc : à sa place, puis en s'éloignant du sommet. */
function placesAngle(sommet: Point, texte: Point) {
  return (_l: number, h: number) => {
    const d = distance(sommet, texte) || 1
    const u = { x: (texte.x - sommet.x) / d, y: (texte.y - sommet.y) / d }
    return [0, 1, 2, 3, 4].map((i) => ({ x: texte.x + u.x * i * 1.4 * h, y: texte.y + u.y * i * 1.4 * h }))
  }
}

/** Dessine l'étiquette à la première place libre, sans sortir de l'image, et note la place prise. */
function poserEtiquette(ctx: CanvasRenderingContext2D, e: Etiquette, occupees: Boite[], k: number, style: Style) {
  const taille = 20 * k
  const marge = 4 * k
  ctx.font = `bold ${taille}px sans-serif`
  const l = ctx.measureText(e.texte).width + 2 * marge
  const h = taille + 2 * marge
  const { width, height } = ctx.canvas
  const candidats = e.places(l, h).map((p) => {
    const b = boiteTournee(p, l, h, e.rotation)
    return { ...b, x: Math.max(b.l / 2, Math.min(width - b.l / 2, b.x)), y: Math.max(b.h / 2, Math.min(height - b.h / 2, b.y)) }
  })
  const place = placerEtiquette(candidats, occupees)
  occupees.push(place)

  ctx.save()
  ctx.translate(place.x, place.y)
  ctx.rotate((e.rotation * Math.PI) / 180)
  ctx.fillStyle = style.fond
  rectangleArrondi(ctx, -l / 2, -h / 2, l, h, 4 * k)
  ctx.fill()
  if (style.bord) {
    ctx.strokeStyle = e.manquante ? style.manquante : style.bord
    ctx.lineWidth = k
    ctx.stroke()
  }
  ctx.fillStyle = e.manquante ? style.manquante : style.texte
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(e.texte, 0, 0)
  ctx.restore()
}

/** Dessine cotes et repères ; `vers` passe des coordonnées du support à celles du canvas. */
function dessinerCalque(ctx: CanvasRenderingContext2D, ann: Annotations, vers: (p: Point) => Point, k: number, style = STYLE_PHOTO) {
  // Tous les traits d'abord : aucun ne passe ensuite sur le texte d'une autre cote.
  const etiquettes: Etiquette[] = []
  for (const c of ann.cotes) {
    const a = vers(c.a)
    const b = vers(c.b)
    const manquante = c.valeurMm === null
    if (c.sommet) {
      const s = vers(c.sommet)
      const branches = [a.x, a.y, s.x, s.y, b.x, b.y]
      const arc = arcAngle(s, a, b, RAYON_ARC * k, ECART_TEXTE_ARC * k, c.valeurMm)
      if (style.halo) {
        polyligne(ctx, branches, 7 * k, style.halo)
        polyligne(ctx, arc.points, 7 * k, style.halo)
      }
      polyligne(ctx, branches, style.epaisseur * k, style.trait)
      polyligne(ctx, arc.points, style.epaisseur * k, style.trait)
      etiquettes.push({ texte: texteAngle(c.valeurMm, c.libelle), places: placesAngle(s, arc.texte), rotation: 0, manquante })
    } else {
      if (style.halo) fleche(ctx, a, b, 7 * k, 16 * k, 16 * k, style.halo)
      fleche(ctx, a, b, style.epaisseur * k, 13 * k, 11 * k, style.trait)
      etiquettes.push({ texte: texteCote(c.valeurMm, c.libelle), places: placesCote(a, b, k), rotation: angleLisible(a, b), manquante })
    }
  }

  const reperes = ann.reperes.map((r) => {
    const p = vers(r.position)
    const taille = 18 * k
    const marge = 6 * k
    const pointe = { l: 14 * k, h: 12 * k }
    ctx.font = `bold ${taille}px sans-serif`
    const l = ctx.measureText(r.texte).width + 2 * marge
    const h = taille + 2 * marge
    return { texte: r.texte, p, taille, pointe, l, h, haut: p.y - pointe.h - h }
  })

  const occupees: Boite[] = reperes.map((r) => ({ x: r.p.x, y: r.haut + r.h / 2, l: r.l, h: r.h }))
  for (const e of etiquettes) poserEtiquette(ctx, e, occupees, k, style)

  for (const { texte, p, taille, pointe, l, h, haut } of reperes) {
    // Étiquette blanche dont la pointe touche le point visé.
    ctx.font = `bold ${taille}px sans-serif`
    ctx.beginPath()
    ctx.moveTo(p.x - l / 2, haut)
    ctx.lineTo(p.x + l / 2, haut)
    ctx.lineTo(p.x + l / 2, haut + h)
    ctx.lineTo(p.x + pointe.l / 2, haut + h)
    ctx.lineTo(p.x, p.y)
    ctx.lineTo(p.x - pointe.l / 2, haut + h)
    ctx.lineTo(p.x - l / 2, haut + h)
    ctx.closePath()
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2 * k
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.fillStyle = '#000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(texte, p.x, haut + h / 2)
  }
}

function legendeCotes(ann: Annotations): string {
  const n = ann.cotes.length
  const manquantes = ann.cotes.filter((c) => c.valeurMm === null).length
  const parties = [`${n} cote${n > 1 ? 's' : ''}`]
  if (manquantes) parties.push(`dont ${manquantes} sans valeur (en rouge)`)
  if (ann.reperes.length) parties.push(`${ann.reperes.length} repère${ann.reperes.length > 1 ? 's' : ''}`)
  return parties.join(', ')
}

/** Photo avec ses cotes et repères par-dessus. */
export async function rendrePhoto(photo: Photo, ann: Annotations): Promise<ImagePdf> {
  const { img, liberer } = await chargerImage(photo.blob)
  try {
    const s = Math.min(1, (photo.plan ? TAILLE_MAX_PLAN : TAILLE_MAX) / Math.max(photo.width, photo.height))
    const { canvas, ctx } = nouveauCanvas(photo.width * s, photo.height * s)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const vers = (p: Point) => ({ x: p.x * s, y: p.y * s })
    if (photo.plan) dessinerCalque(ctx, ann, vers, facteurPlan(canvas.width, canvas.height), STYLE_PLAN)
    else dessinerCalque(ctx, ann, vers, facteur(canvas.width, canvas.height))
    const legende = `${legendeCotes(ann)} · ${photo.plan ? 'importé' : 'prise'} le ${new Date(photo.createdAt).toLocaleDateString('fr-FR')}`
    return { octets: await versJpeg(canvas), format: 'jpg', legende, plan: photo.plan }
  } finally {
    liberer()
  }
}

// Boucles plutôt que Math.min(...t) : un tracé à main levée peut compter des milliers de points.
const plusPetit = (t: number[]) => t.reduce((a, b) => Math.min(a, b), Infinity)
const plusGrand = (t: number[]) => t.reduce((a, b) => Math.max(a, b), -Infinity)

/** Croquis cadré sur ce qui est dessiné (feuille entière s'il est vide). */
export async function rendreCroquis(croquis: Croquis, ann: Annotations): Promise<ImagePdf> {
  const xs: number[] = []
  const ys: number[] = []
  for (const t of ann.traits) t.points.forEach((v, i) => (i % 2 === 0 ? xs : ys).push(v))
  for (const c of ann.cotes) {
    xs.push(c.a.x, c.b.x)
    ys.push(c.a.y, c.b.y)
    if (c.sommet) {
      xs.push(c.sommet.x)
      ys.push(c.sommet.y)
    }
  }
  for (const r of ann.reperes) {
    xs.push(r.position.x)
    ys.push(r.position.y)
  }

  let boite = { x: 0, y: 0, l: croquis.largeur, h: croquis.hauteur }
  if (xs.length) {
    const marge = croquis.pas * 2
    // Au moins 12 carreaux de côté : un petit dessin n'est pas agrandi à l'excès.
    const mini = croquis.pas * 12
    const [x0, x1, y0, y1] = [plusPetit(xs), plusGrand(xs), plusPetit(ys), plusGrand(ys)]
    const l = Math.max(x1 - x0 + 2 * marge, mini)
    const h = Math.max(y1 - y0 + 2 * marge, mini)
    boite = { x: (x0 + x1) / 2 - l / 2, y: (y0 + y1) / 2 - h / 2, l, h }
  }

  const s = TAILLE_MAX / Math.max(boite.l, boite.h)
  const { canvas, ctx } = nouveauCanvas(boite.l * s, boite.h * s)
  const k = facteur(canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(s, 0, 0, s, -boite.x * s, -boite.y * s)
  dessinerFeuille(ctx, croquis, ann.traits, s / k)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  dessinerCalque(ctx, ann, (p) => ({ x: (p.x - boite.x) * s, y: (p.y - boite.y) * s }), k)
  return { octets: await versJpeg(canvas), format: 'jpg', legende: `${legendeCotes(ann)} · croquis non à l'échelle, seules les cotes font foi` }
}
