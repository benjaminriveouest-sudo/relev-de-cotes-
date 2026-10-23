import type { Annotations, Croquis, Photo, Point } from '../../models/types'
import { angleLisible, distance, milieu } from '../annotation/geometry'
import { COULEUR, COULEUR_MANQUANTE, texteCote } from '../annotation/shapes'
import { dessinerFeuille } from '../croquis/feuille'
import type { ImagePdf } from './pdf'

/** Côté le plus long d'une image dans le PDF : net à l'impression, fichier raisonnable. */
const TAILLE_MAX = 1600
const QUALITE_JPEG = 0.85

/**
 * Taille des cotes et repères selon la taille de l'image : les tailles de l'éditeur
 * (en pixels écran) sont multipliées pour rester lisibles une fois l'image posée sur une page A4.
 */
const facteur = (largeur: number, hauteur: number) => Math.max(largeur, hauteur) / 1000

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

/** Dessine cotes et repères ; `vers` passe des coordonnées du support à celles du canvas. */
function dessinerCalque(ctx: CanvasRenderingContext2D, ann: Annotations, vers: (p: Point) => Point, k: number) {
  for (const c of ann.cotes) {
    const a = vers(c.a)
    const b = vers(c.b)
    fleche(ctx, a, b, 7 * k, 16 * k, 16 * k, '#000')
    fleche(ctx, a, b, 3 * k, 13 * k, 11 * k, COULEUR)

    const texte = texteCote(c.valeurMm, c.libelle)
    const taille = 20 * k
    const marge = 4 * k
    ctx.font = `bold ${taille}px sans-serif`
    const l = ctx.measureText(texte).width + 2 * marge
    const h = taille + 2 * marge
    const m = milieu(a, b)
    ctx.save()
    ctx.translate(m.x, m.y)
    ctx.rotate((angleLisible(a, b) * Math.PI) / 180)
    ctx.fillStyle = '#000'
    rectangleArrondi(ctx, -l / 2, -h / 2, l, h, 4 * k)
    ctx.fill()
    ctx.fillStyle = c.valeurMm === null ? COULEUR_MANQUANTE : COULEUR
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(texte, 0, 0)
    ctx.restore()
  }

  for (const r of ann.reperes) {
    const p = vers(r.position)
    const taille = 18 * k
    const marge = 6 * k
    const pointe = { l: 14 * k, h: 12 * k }
    ctx.font = `bold ${taille}px sans-serif`
    const l = ctx.measureText(r.texte).width + 2 * marge
    const h = taille + 2 * marge
    const haut = p.y - pointe.h - h
    // Étiquette blanche dont la pointe touche le point visé.
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
    ctx.fillText(r.texte, p.x, haut + h / 2)
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
    const s = Math.min(1, TAILLE_MAX / Math.max(photo.width, photo.height))
    const { canvas, ctx } = nouveauCanvas(photo.width * s, photo.height * s)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    dessinerCalque(ctx, ann, (p) => ({ x: p.x * s, y: p.y * s }), facteur(canvas.width, canvas.height))
    const legende = `${legendeCotes(ann)} · prise le ${new Date(photo.createdAt).toLocaleDateString('fr-FR')}`
    return { octets: await versJpeg(canvas), format: 'jpg', legende }
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
