import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { CASES_A_COCHER, STATUTS, type Chantier, type Note, type Ouvrage } from '../../models/types'

/** Image déjà rendue (photo ou croquis avec son calque), prête à poser sur une page. */
export interface ImagePdf {
  octets: Uint8Array
  format: 'jpg' | 'png'
  legende: string
}

/** Tout ce qu'il faut pour la fiche d'un ouvrage. */
export interface FichePdf {
  chantier: Chantier
  ouvrage: Ouvrage
  note: Note
  notesVocales: { nombre: number; dureeMs: number }
  photos: ImagePdf[]
  croquis: ImagePdf[]
  /** Dernière modification du relevé (ouvrage, photos, cotes, croquis, notes). */
  dateReleve: number
}

export interface InfosExport {
  auteur: string
  date: Date
}

// A4 portrait (largeur, hauteur), en points (1/72 de pouce).
const A4: [number, number] = [595.28, 841.89]
const MARGE = 40
const LARGEUR = A4[0] - 2 * MARGE
/** Bas de la zone utile : en dessous, le pied de page. */
const BAS = 55
const COLONNE_VALEUR = 120
const NOIR = rgb(0, 0, 0)
const GRIS = rgb(0.38, 0.38, 0.38)
const FILET = rgb(0.78, 0.78, 0.78)
const ROUGE = rgb(0.8, 0.15, 0.05)

const libelleStatut = (o: Ouvrage) => STATUTS.find((s) => s.valeur === o.statut)?.libelle ?? o.statut
export const titreOuvrage = (o: Ouvrage) => [o.type, o.repere].filter(Boolean).join(' · ')

export function formatDate(d: Date | number, avecHeure = false): string {
  const date = new Date(d)
  const jour = date.toLocaleDateString('fr-FR')
  return avecHeure ? `${jour} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : jour
}

/** Date AAAA-MM-JJ du chantier en JJ/MM/AAAA. */
function dateChantier(iso: string): string {
  return iso ? formatDate(new Date(`${iso}T12:00`)) : ''
}

/** Les polices standard du PDF ne connaissent pas tous les caractères (émojis, flèches) : on les remplace. */
export function nettoyer(texte: string, police: PDFFont): string {
  let sortie = ''
  for (const c of texte.replace(/\r\n?/g, '\n').replace(/\t/g, ' ')) {
    if (c === '\n') {
      sortie += c
      continue
    }
    try {
      police.encodeText(c)
      sortie += c
    } catch {
      sortie += '?'
    }
  }
  return sortie
}

/** Coupe un texte en lignes qui tiennent dans `largeur` (mots trop longs coupés au caractère). */
export function couper(texte: string, police: PDFFont, taille: number, largeur: number): string[] {
  const largeurDe = (t: string) => police.widthOfTextAtSize(t, taille)
  const lignes: string[] = []
  for (const paragraphe of nettoyer(texte, police).split('\n')) {
    let ligne = ''
    for (const mot of paragraphe.split(' ')) {
      const essai = ligne ? `${ligne} ${mot}` : mot
      if (largeurDe(essai) <= largeur) {
        ligne = essai
        continue
      }
      if (ligne) lignes.push(ligne)
      ligne = ''
      let reste = mot
      while (largeurDe(reste) > largeur) {
        let n = reste.length - 1
        while (n > 1 && largeurDe(reste.slice(0, n)) > largeur) n--
        lignes.push(reste.slice(0, n))
        reste = reste.slice(n)
      }
      ligne = reste
    }
    lignes.push(ligne)
  }
  return lignes
}

function tronquer(texte: string, police: PDFFont, taille: number, largeur: number): string {
  let t = nettoyer(texte.replace(/\s+/g, ' '), police)
  if (police.widthOfTextAtSize(t, taille) <= largeur) return t
  while (t && police.widthOfTextAtSize(`${t}…`, taille) > largeur) t = t.slice(0, -1)
  return `${t}…`
}

/** Écriture de haut en bas, avec saut de page automatique. */
class Mise {
  page!: PDFPage
  y = 0
  /** Texte du pied de page de chaque page, dans l'ordre. */
  pieds: string[] = []
  pied = ''

  readonly doc: PDFDocument
  readonly police: PDFFont
  readonly gras: PDFFont

  constructor(doc: PDFDocument, police: PDFFont, gras: PDFFont) {
    this.doc = doc
    this.police = police
    this.gras = gras
  }

  /** Les photos et croquis en largeur ont une page à l'italienne, pour être le plus grand possible. */
  nouvellePage(paysage = false) {
    this.page = this.doc.addPage(paysage ? [A4[1], A4[0]] : A4)
    this.pieds.push(this.pied)
    this.y = this.page.getHeight() - MARGE
  }

  /** Garantit `h` points libres sur la page, sinon passe à la suivante. */
  place(h: number) {
    if (this.y - h < BAS) this.nouvellePage()
  }

  texte(t: string, { taille = 11, gras = false, couleur = NOIR, x = MARGE, largeur = LARGEUR } = {}) {
    const police = gras ? this.gras : this.police
    const hauteur = taille * 1.3
    for (const ligne of couper(t, police, taille, largeur)) {
      this.place(hauteur)
      this.y -= taille
      this.page.drawText(ligne, { x, y: this.y, size: taille, font: police, color: couleur })
      this.y -= hauteur - taille
    }
  }

  titreSection(t: string) {
    this.place(40)
    this.y -= 14
    this.texte(t, { taille: 13, gras: true })
    this.y -= 3
    this.page.drawLine({ start: { x: MARGE, y: this.y }, end: { x: MARGE + LARGEUR, y: this.y }, thickness: 0.8, color: FILET })
    this.y -= 8
  }

  /** Ligne « libellé : valeur », la valeur peut tenir sur plusieurs lignes. */
  champ(libelle: string, valeur: string) {
    if (!valeur.trim()) return
    const taille = 11
    const lignes = couper(valeur, this.gras, taille, LARGEUR - COLONNE_VALEUR)
    this.place(Math.min(lignes.length, 3) * taille * 1.3)
    this.page.drawText(nettoyer(libelle, this.police), { x: MARGE, y: this.y - taille, size: 9.5, font: this.police, color: GRIS })
    this.texte(valeur, { gras: true, x: MARGE + COLONNE_VALEUR, largeur: LARGEUR - COLONNE_VALEUR })
    this.y -= 3
  }

  async pageImage(image: ImagePdf, titre: string) {
    const img = image.format === 'jpg' ? await this.doc.embedJpg(image.octets) : await this.doc.embedPng(image.octets)
    this.nouvellePage(img.width > img.height)
    const largeur = this.page.getWidth() - 2 * MARGE
    this.texte(titre, { taille: 12, gras: true, largeur })
    this.texte(image.legende, { taille: 10, couleur: GRIS, largeur })
    this.y -= 6
    const echelle = Math.min(largeur / img.width, (this.y - BAS) / img.height)
    const l = img.width * echelle
    const h = img.height * echelle
    const x = MARGE + (largeur - l) / 2
    this.page.drawImage(img, { x, y: this.y - h, width: l, height: h })
    this.page.drawRectangle({ x, y: this.y - h, width: l, height: h, borderColor: FILET, borderWidth: 0.8 })
    this.y -= h
  }

  /** Pieds de page, numérotés à partir de `premier` sur un total de `total`. */
  numeroter(premier: number, total: number) {
    this.doc.getPages().forEach((page, i) => {
      const taille = 8.5
      const numero = `Page ${premier + i} / ${total}`
      const largeurNumero = this.police.widthOfTextAtSize(numero, taille)
      const largeur = page.getWidth() - 2 * MARGE
      page.drawLine({ start: { x: MARGE, y: 38 }, end: { x: MARGE + largeur, y: 38 }, thickness: 0.5, color: FILET })
      page.drawText(tronquer(this.pieds[i] ?? '', this.police, taille, largeur - largeurNumero - 20), {
        x: MARGE,
        y: 26,
        size: taille,
        font: this.police,
        color: GRIS,
      })
      page.drawText(numero, { x: MARGE + largeur - largeurNumero, y: 26, size: taille, font: this.police, color: GRIS })
    })
  }
}

async function nouvelleMise(titre: string): Promise<Mise> {
  const doc = await PDFDocument.create()
  doc.setTitle(titre)
  doc.setProducer('Relevé de cotes')
  doc.setLanguage('fr-FR')
  return new Mise(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold))
}

function blocChantier(m: Mise, c: Chantier) {
  m.titreSection('Chantier')
  m.champ('Nom', c.nom)
  m.champ('Client', c.client)
  m.champ('Adresse', c.adresse)
  m.champ('Contact sur place', c.contact)
  m.champ('Date prévue', dateChantier(c.date))
}

/** Ajoute la fiche d'un ouvrage : page de synthèse puis une page par photo et par croquis. */
async function ajouterFiche(m: Mise, f: FichePdf, infos: InfosExport) {
  const titre = titreOuvrage(f.ouvrage)
  m.pied = `${f.chantier.nom} · ${titre}`
  m.nouvellePage()
  m.texte('FICHE DE RELEVÉ', { taille: 9, gras: true, couleur: GRIS })
  m.y -= 2
  m.texte(titre, { taille: 20, gras: true })
  if (f.ouvrage.localisation) m.texte(f.ouvrage.localisation, { taille: 12, couleur: GRIS })

  blocChantier(m, f.chantier)

  m.titreSection('Ouvrage')
  m.champ('Type', f.ouvrage.type)
  m.champ('Repère', f.ouvrage.repere)
  m.champ('Localisation', f.ouvrage.localisation)
  m.champ('Statut', libelleStatut(f.ouvrage))

  m.titreSection('Relevé')
  m.champ('Relevé par', infos.auteur)
  m.champ('Dernière modification', formatDate(f.dateReleve, true))
  m.champ('PDF créé le', formatDate(infos.date, true))
  const contenu = [
    `${f.photos.length} photo${f.photos.length > 1 ? 's' : ''}`,
    `${f.croquis.length} croquis`,
  ].join(', ')
  m.champ('Contenu', f.photos.length + f.croquis.length > 0 ? `${contenu} (pages suivantes)` : contenu)

  m.titreSection('Points relevés')
  let aucuneCase = true
  for (const groupe of CASES_A_COCHER) {
    const cochees = groupe.cases.filter((c) => f.note.cases.includes(c.id)).map((c) => c.libelle)
    if (!cochees.length) continue
    aucuneCase = false
    m.champ(groupe.groupe, cochees.join(', '))
  }
  if (aucuneCase) m.texte('Aucune case cochée.', { couleur: GRIS })

  m.titreSection('Note')
  if (f.note.texte.trim()) m.texte(f.note.texte.trim())
  else m.texte('Aucune note écrite.', { couleur: GRIS })

  const { nombre, dureeMs } = f.notesVocales
  if (nombre > 0) {
    m.titreSection('Notes vocales')
    const s = Math.round(dureeMs / 1000)
    const duree = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    m.texte(
      `${nombre} note${nombre > 1 ? 's' : ''} vocale${nombre > 1 ? 's' : ''} (${duree} au total), à écouter dans l'appli : elles ne sont pas encore transcrites.`,
      { couleur: ROUGE },
    )
  }

  for (const [i, photo] of f.photos.entries()) await m.pageImage(photo, `${titre} · Photo ${i + 1}/${f.photos.length}`)
  for (const [i, croquis] of f.croquis.entries()) await m.pageImage(croquis, `${titre} · Croquis ${i + 1}/${f.croquis.length}`)
}

/** PDF d'un seul ouvrage. */
export async function creerPdfOuvrage(fiche: FichePdf, infos: InfosExport): Promise<Uint8Array> {
  const m = await nouvelleMise(`Relevé ${fiche.chantier.nom} · ${titreOuvrage(fiche.ouvrage)}`)
  await ajouterFiche(m, fiche, infos)
  m.numeroter(1, m.doc.getPageCount())
  return m.doc.save()
}

interface LigneSommaire {
  ouvrage: Ouvrage
  page: number
}

function dessinerSommaire(m: Mise, chantier: Chantier, lignes: LigneSommaire[], infos: InfosExport) {
  m.pied = `${chantier.nom} · Sommaire`
  m.nouvellePage()
  m.texte('RELEVÉ DE CHANTIER', { taille: 9, gras: true, couleur: GRIS })
  m.y -= 2
  m.texte(chantier.nom, { taille: 20, gras: true })
  blocChantier(m, chantier)
  m.champ('Relevé par', infos.auteur)
  m.champ('PDF créé le', formatDate(infos.date, true))

  const n = lignes.length
  const parStatut = STATUTS.map((s) => ({ ...s, nb: lignes.filter((l) => l.ouvrage.statut === s.valeur).length }))
    .filter((s) => s.nb > 0)
    .map((s) => `${s.nb} ${s.libelle.toLowerCase()}`)
  m.titreSection(`Ouvrages (${n})`)
  if (!n) {
    m.texte("Aucun ouvrage dans ce chantier.", { couleur: GRIS })
    return
  }
  m.texte(parStatut.join(', '), { couleur: GRIS })
  m.y -= 6

  const colonnes = { ouvrage: MARGE, localisation: MARGE + 200, statut: MARGE + 380, page: MARGE + LARGEUR }
  const entete = () => {
    m.place(36)
    const y = m.y - 9
    const opts = { y, size: 9, font: m.gras, color: GRIS }
    m.page.drawText('Ouvrage', { ...opts, x: colonnes.ouvrage })
    m.page.drawText('Localisation', { ...opts, x: colonnes.localisation })
    m.page.drawText('Statut', { ...opts, x: colonnes.statut })
    m.page.drawText('Page', { ...opts, x: colonnes.page - m.gras.widthOfTextAtSize('Page', 9) })
    m.y -= 15
  }
  entete()
  for (const { ouvrage, page } of lignes) {
    if (m.y - 20 < BAS) {
      m.nouvellePage()
      entete()
    }
    const y = m.y - 13
    m.page.drawText(tronquer(titreOuvrage(ouvrage), m.gras, 11, 190), { x: colonnes.ouvrage, y, size: 11, font: m.gras })
    m.page.drawText(tronquer(ouvrage.localisation, m.police, 10, 170), { x: colonnes.localisation, y, size: 10, font: m.police })
    m.page.drawText(libelleStatut(ouvrage), { x: colonnes.statut, y, size: 10, font: m.police })
    const num = String(page)
    m.page.drawText(num, { x: colonnes.page - m.gras.widthOfTextAtSize(num, 11), y, size: 11, font: m.gras })
    m.y -= 20
    m.page.drawLine({ start: { x: MARGE, y: m.y + 2 }, end: { x: MARGE + LARGEUR, y: m.y + 2 }, thickness: 0.5, color: FILET })
  }
}

/**
 * PDF du chantier : sommaire puis la fiche de chaque ouvrage.
 * Les fiches sont chargées une par une (`charger`) pour ne pas garder toutes les photos en mémoire.
 */
export async function creerPdfChantier(
  chantier: Chantier,
  ouvrages: Ouvrage[],
  charger: (ouvrage: Ouvrage, index: number) => Promise<FichePdf>,
  infos: InfosExport,
): Promise<Uint8Array> {
  const titre = `Relevé ${chantier.nom}`
  const corps = await nouvelleMise(titre)
  const debuts: number[] = []
  for (const [i, o] of ouvrages.entries()) {
    debuts.push(corps.doc.getPageCount())
    await ajouterFiche(corps, await charger(o, i), infos)
  }

  // Le sommaire est dessiné une première fois pour savoir combien de pages il prend.
  const lignes = (decalage: number) => ouvrages.map((ouvrage, i) => ({ ouvrage, page: debuts[i] + decalage + 1 }))
  const essai = await nouvelleMise(titre)
  dessinerSommaire(essai, chantier, lignes(0), infos)
  const nbSommaire = essai.doc.getPageCount()

  const final = await nouvelleMise(titre)
  dessinerSommaire(final, chantier, lignes(nbSommaire), infos)
  const total = nbSommaire + corps.doc.getPageCount()
  final.numeroter(1, total)
  corps.numeroter(nbSommaire + 1, total)
  const pages = await final.doc.copyPages(corps.doc, corps.doc.getPageIndices())
  for (const p of pages) final.doc.addPage(p)
  return final.doc.save()
}
