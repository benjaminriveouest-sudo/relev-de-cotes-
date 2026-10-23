import {
  getChantier,
  getNote,
  getOuvrage,
  listCroquis,
  listNotesVocales,
  listOuvrages,
  listPhotos,
  loadAnnotations,
} from '../../db/db'
import type { Chantier, Ouvrage } from '../../models/types'
import type { FichePdf, InfosExport } from './pdf'
import { rendreCroquis, rendrePhoto } from './rendu'

export interface PdfCree {
  octets: Uint8Array
  nomFichier: string
}

/** Message de progression affiché pendant la création. */
export type Progres = (message: string) => void

/** Nom de fichier lisible, sans accents ni caractères interdits (certains navigateurs et messageries les refusent). */
export function nomFichier(...parties: string[]): string {
  const nom = parties
    .filter((p) => p.trim())
    .join(' - ')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'Oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]+/g, ' ')
    .replace(/[\\/:*?"<>|#%\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)
  return `${nom || 'Releve'}.pdf`
}

/** Lit l'ouvrage dans la base et rend ses photos et croquis annotés en images. */
async function chargerFiche(ouvrage: Ouvrage, chantier: Chantier, progres: Progres, prefixe = ''): Promise<FichePdf> {
  const [photos, croquis, note, vocales] = await Promise.all([
    listPhotos(ouvrage.id),
    listCroquis(ouvrage.id),
    getNote(ouvrage.id),
    listNotesVocales(ouvrage.id),
  ])
  // Les listes de l'appli montrent le plus récent d'abord ; le PDF suit l'ordre de prise.
  photos.reverse()
  croquis.reverse()

  const imagesPhotos = []
  let dateReleve = Math.max(ouvrage.updatedAt, note.updatedAt, ...vocales.map((v) => v.updatedAt))
  for (const [i, { photo }] of photos.entries()) {
    progres(`${prefixe}Photo ${i + 1} sur ${photos.length}…`)
    const ann = await loadAnnotations(photo.id)
    dateReleve = Math.max(dateReleve, photo.updatedAt, ...ann.cotes.map((c) => c.updatedAt), ...ann.reperes.map((r) => r.updatedAt))
    imagesPhotos.push(await rendrePhoto(photo, ann))
  }
  const imagesCroquis = []
  for (const [i, c] of croquis.entries()) {
    progres(`${prefixe}Croquis ${i + 1} sur ${croquis.length}…`)
    dateReleve = Math.max(dateReleve, c.croquis.updatedAt)
    imagesCroquis.push(await rendreCroquis(c.croquis, c.annotations))
  }

  return {
    chantier,
    ouvrage,
    note,
    notesVocales: { nombre: vocales.length, dureeMs: vocales.reduce((t, v) => t + v.dureeMs, 0) },
    photos: imagesPhotos,
    croquis: imagesCroquis,
    dateReleve,
  }
}

export async function exporterOuvrage(ouvrageId: string, auteur: string, progres: Progres): Promise<PdfCree> {
  progres('Lecture du relevé…')
  const ouvrage = await getOuvrage(ouvrageId)
  const chantier = ouvrage && (await getChantier(ouvrage.chantierId))
  if (!ouvrage || !chantier) throw new Error("l'ouvrage n'existe plus")
  // pdf-lib n'est chargé qu'au premier export : l'appli reste légère au démarrage.
  const { creerPdfOuvrage } = await import('./pdf')
  const fiche = await chargerFiche(ouvrage, chantier, progres)
  progres('Assemblage du PDF…')
  const infos: InfosExport = { auteur, date: new Date() }
  return {
    octets: await creerPdfOuvrage(fiche, infos),
    nomFichier: nomFichier('Releve', chantier.nom, ouvrage.type, ouvrage.repere),
  }
}

export async function exporterChantier(chantierId: string, auteur: string, progres: Progres): Promise<PdfCree> {
  progres('Lecture du chantier…')
  const chantier = await getChantier(chantierId)
  if (!chantier) throw new Error("le chantier n'existe plus")
  const ouvrages = (await listOuvrages(chantierId)).map((r) => r.ouvrage)
  const { creerPdfChantier } = await import('./pdf')
  const infos: InfosExport = { auteur, date: new Date() }
  const octets = await creerPdfChantier(
    chantier,
    ouvrages,
    (o, i) => chargerFiche(o, chantier, progres, `Ouvrage ${i + 1} sur ${ouvrages.length} · `),
    infos,
  )
  return { octets, nomFichier: nomFichier('Releve', chantier.nom) }
}
