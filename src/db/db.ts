import Dexie, { type Table } from 'dexie'
import { newId } from '../models/id'
import { suiviModifications, TABLE_ENVOIS, type Envoi } from '../sync/suivi'
import type {
  Annotations,
  Chantier,
  Cote,
  Croquis,
  Note,
  NoteVocale,
  Ouvrage,
  Photo,
  Repere,
  StatutOuvrage,
  Trait,
} from '../models/types'

export const NOM_BASE = 'releve-de-cotes'

class RelevesDB extends Dexie {
  chantiers!: Table<Chantier, string>
  ouvrages!: Table<Ouvrage, string>
  photos!: Table<Photo, string>
  cotes!: Table<Cote, string>
  reperes!: Table<Repere, string>
  croquis!: Table<Croquis, string>
  traits!: Table<Trait, string>
  notes!: Table<Note, string>
  notesVocales!: Table<NoteVocale, string>
  envois!: Table<Envoi, string>
  meta!: Table<{ cle: string; valeur: unknown }, string>

  constructor() {
    super(NOM_BASE)
    this.version(1).stores({
      photos: 'id, createdAt',
      cotes: 'id, photoId',
      reperes: 'id, photoId',
    })
    this.version(2)
      .stores({
        chantiers: 'id, updatedAt',
        ouvrages: 'id, chantierId',
        photos: 'id, createdAt, ouvrageId',
      })
      .upgrade(async (tx) => {
        // Les photos de l'étape 1 n'avaient pas d'ouvrage : on les range pour ne rien perdre.
        const photos = tx.table<Photo, string>('photos')
        if ((await photos.count()) === 0) return
        const now = Date.now()
        const chantier: Chantier = {
          id: newId(),
          nom: "Photos de l'étape 1",
          client: '',
          adresse: '',
          contact: '',
          date: dateDuJour(),
          createdAt: now,
          updatedAt: now,
        }
        const ouvrage: Ouvrage = {
          id: newId(),
          chantierId: chantier.id,
          type: 'Autre',
          repere: 'Photos à classer',
          localisation: '',
          statut: 'a_relever',
          createdAt: now,
          updatedAt: now,
        }
        await tx.table('chantiers').add(chantier)
        await tx.table('ouvrages').add(ouvrage)
        await photos.toCollection().modify({ ouvrageId: ouvrage.id })
      })
    // Étape 3 : nouvelles tables seulement, les données existantes ne bougent pas.
    this.version(3).stores({
      croquis: 'id, ouvrageId',
      traits: 'id, croquisId',
      notes: 'id, ouvrageId',
      notesVocales: 'id, ouvrageId',
    })
    // Étape 5 : file d'envoi et état de la synchronisation, nouvelles tables seulement.
    this.version(4).stores({
      [TABLE_ENVOIS]: 'cle',
      meta: 'cle',
    })
    this.use(suiviModifications())
  }
}

export const db = new RelevesDB()

/** Date du jour au format AAAA-MM-JJ, à l'heure locale. */
export function dateDuJour(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// --- Chantiers ---

export type CompteStatuts = Record<StatutOuvrage, number>

export interface ChantierResume {
  chantier: Chantier
  statuts: CompteStatuts
}

export async function listChantiers(): Promise<ChantierResume[]> {
  const [chantiers, ouvrages] = await Promise.all([db.chantiers.toArray(), db.ouvrages.toArray()])
  const comptes = new Map<string, CompteStatuts>()
  for (const o of ouvrages) {
    const c = comptes.get(o.chantierId) ?? { a_relever: 0, releve: 0, valide: 0 }
    c[o.statut]++
    comptes.set(o.chantierId, c)
  }
  return chantiers
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((chantier) => ({ chantier, statuts: comptes.get(chantier.id) ?? { a_relever: 0, releve: 0, valide: 0 } }))
}

export function getChantier(id: string): Promise<Chantier | undefined> {
  return db.chantiers.get(id)
}

export async function saveChantier(chantier: Chantier): Promise<void> {
  await db.chantiers.put({ ...chantier, updatedAt: Date.now() })
}

/** Tables du contenu d'un ouvrage, à verrouiller pour le supprimer. */
const tablesOuvrage = () => [db.ouvrages, db.photos, db.cotes, db.reperes, db.croquis, db.traits, db.notes, db.notesVocales]

/** Supprime le chantier avec tous ses ouvrages, photos et cotes. */
export async function deleteChantier(id: string): Promise<void> {
  await db.transaction('rw', [db.chantiers, ...tablesOuvrage()], async () => {
    const ouvrages = await db.ouvrages.where('chantierId').equals(id).primaryKeys()
    for (const o of ouvrages) await supprimerOuvrage(o)
    await db.chantiers.delete(id)
  })
}

// --- Ouvrages ---

export interface OuvrageResume {
  ouvrage: Ouvrage
  nbPhotos: number
}

export async function listOuvrages(chantierId: string): Promise<OuvrageResume[]> {
  const ouvrages = await db.ouvrages.where('chantierId').equals(chantierId).sortBy('createdAt')
  return Promise.all(
    ouvrages.map(async (ouvrage) => ({
      ouvrage,
      nbPhotos: await db.photos.where('ouvrageId').equals(ouvrage.id).count(),
    })),
  )
}

export function getOuvrage(id: string): Promise<Ouvrage | undefined> {
  return db.ouvrages.get(id)
}

/** Enregistre l'ouvrage et remonte le chantier en tête de liste. */
export async function saveOuvrage(ouvrage: Ouvrage): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.ouvrages, db.chantiers, async () => {
    await db.ouvrages.put({ ...ouvrage, updatedAt: now })
    await db.chantiers.update(ouvrage.chantierId, { updatedAt: now })
  })
}

export async function deleteOuvrage(id: string): Promise<void> {
  await db.transaction('rw', tablesOuvrage(), () => supprimerOuvrage(id))
}

async function supprimerOuvrage(id: string): Promise<void> {
  const photos = await db.photos.where('ouvrageId').equals(id).primaryKeys()
  const croquis = await db.croquis.where('ouvrageId').equals(id).primaryKeys()
  const supports = [...photos, ...croquis]
  await db.cotes.where('photoId').anyOf(supports).delete()
  await db.reperes.where('photoId').anyOf(supports).delete()
  await db.traits.where('croquisId').anyOf(croquis).delete()
  await db.photos.bulkDelete(photos)
  await db.croquis.bulkDelete(croquis)
  await db.notes.where('ouvrageId').equals(id).delete()
  await db.notesVocales.where('ouvrageId').equals(id).delete()
  await db.ouvrages.delete(id)
}

// --- Photos ---

export interface PhotoResume {
  photo: Photo
  nbCotes: number
}

export async function listPhotos(ouvrageId: string): Promise<PhotoResume[]> {
  const photos = (await db.photos.where('ouvrageId').equals(ouvrageId).sortBy('createdAt')).reverse()
  return Promise.all(
    photos.map(async (photo) => ({
      photo,
      nbCotes: await db.cotes.where('photoId').equals(photo.id).count(),
    })),
  )
}

export function getPhoto(id: string): Promise<Photo | undefined> {
  return db.photos.get(id)
}

export async function addPhoto(photo: Photo): Promise<void> {
  await db.photos.add(photo)
}

export async function deletePhoto(id: string): Promise<void> {
  await db.transaction('rw', db.photos, db.cotes, db.reperes, async () => {
    await db.cotes.where('photoId').equals(id).delete()
    await db.reperes.where('photoId').equals(id).delete()
    await db.photos.delete(id)
  })
}

/** Calque d'une photo ou d'un croquis (même identifiant de support pour les deux). */
export async function loadAnnotations(supportId: string): Promise<Annotations> {
  const [cotes, reperes, traits] = await Promise.all([
    db.cotes.where('photoId').equals(supportId).toArray(),
    db.reperes.where('photoId').equals(supportId).toArray(),
    db.traits.where('croquisId').equals(supportId).toArray(),
  ])
  return { cotes, reperes, traits }
}

/** Remplace tout le calque d'une photo ou d'un croquis en une seule transaction : pas d'état à moitié écrit. */
export async function saveAnnotations(supportId: string, ann: Annotations): Promise<void> {
  await db.transaction('rw', [db.photos, db.croquis, db.cotes, db.reperes, db.traits], async () => {
    await db.cotes.where('photoId').equals(supportId).delete()
    await db.reperes.where('photoId').equals(supportId).delete()
    await db.traits.where('croquisId').equals(supportId).delete()
    await db.cotes.bulkPut(ann.cotes)
    await db.reperes.bulkPut(ann.reperes)
    await db.traits.bulkPut(ann.traits)
    const now = Date.now()
    await db.photos.update(supportId, { updatedAt: now })
    await db.croquis.update(supportId, { updatedAt: now })
  })
}

// --- Croquis ---

/** Feuille portrait de 40 × 56 carreaux. */
export function nouveauCroquis(ouvrageId: string): Croquis {
  const now = Date.now()
  return { id: newId(), ouvrageId, largeur: 2000, hauteur: 2800, pas: 50, createdAt: now, updatedAt: now }
}

export interface CroquisResume {
  croquis: Croquis
  annotations: Annotations
}

/** Croquis de l'ouvrage, le plus récent d'abord, avec leur calque pour l'aperçu. */
export async function listCroquis(ouvrageId: string): Promise<CroquisResume[]> {
  const croquis = (await db.croquis.where('ouvrageId').equals(ouvrageId).sortBy('createdAt')).reverse()
  return Promise.all(croquis.map(async (c) => ({ croquis: c, annotations: await loadAnnotations(c.id) })))
}

export function getCroquis(id: string): Promise<Croquis | undefined> {
  return db.croquis.get(id)
}

export async function addCroquis(croquis: Croquis): Promise<void> {
  await db.croquis.add(croquis)
}

export async function deleteCroquis(id: string): Promise<void> {
  await db.transaction('rw', [db.croquis, db.cotes, db.reperes, db.traits], async () => {
    await db.cotes.where('photoId').equals(id).delete()
    await db.reperes.where('photoId').equals(id).delete()
    await db.traits.where('croquisId').equals(id).delete()
    await db.croquis.delete(id)
  })
}

// --- Notes ---

/** Note de l'ouvrage, ou une note vide (pas encore enregistrée) s'il n'en a pas. */
export async function getNote(ouvrageId: string): Promise<Note> {
  const note = await db.notes.where('ouvrageId').equals(ouvrageId).first()
  return note ?? { id: newId(), ouvrageId, texte: '', cases: [], updatedAt: 0 }
}

export async function saveNote(note: Note): Promise<void> {
  await db.notes.put({ ...note, updatedAt: Date.now() })
}

export async function listNotesVocales(ouvrageId: string): Promise<NoteVocale[]> {
  return (await db.notesVocales.where('ouvrageId').equals(ouvrageId).sortBy('createdAt')).reverse()
}

/** Enregistre ou remplace une note vocale (appelé aussi pendant l'enregistrement, par morceaux). */
export async function saveNoteVocale(note: NoteVocale): Promise<void> {
  await db.notesVocales.put({ ...note, updatedAt: Date.now() })
}

export async function deleteNoteVocale(id: string): Promise<void> {
  await db.notesVocales.delete(id)
}

/** Demande au navigateur de ne pas effacer les données en cas de manque de place. */
export async function demanderStockagePersistant(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    // Non bloquant : certains navigateurs refusent sans raison.
  }
}
