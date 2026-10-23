import Dexie, { type Table } from 'dexie'
import { newId } from '../models/id'
import type { Annotations, Chantier, Cote, Ouvrage, Photo, Repere, StatutOuvrage } from '../models/types'

export const NOM_BASE = 'releve-de-cotes'

class RelevesDB extends Dexie {
  chantiers!: Table<Chantier, string>
  ouvrages!: Table<Ouvrage, string>
  photos!: Table<Photo, string>
  cotes!: Table<Cote, string>
  reperes!: Table<Repere, string>

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

/** Supprime le chantier avec tous ses ouvrages, photos et cotes. */
export async function deleteChantier(id: string): Promise<void> {
  await db.transaction('rw', [db.chantiers, db.ouvrages, db.photos, db.cotes, db.reperes], async () => {
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
  await db.transaction('rw', [db.ouvrages, db.photos, db.cotes, db.reperes], () => supprimerOuvrage(id))
}

async function supprimerOuvrage(id: string): Promise<void> {
  const photos = await db.photos.where('ouvrageId').equals(id).primaryKeys()
  await db.cotes.where('photoId').anyOf(photos).delete()
  await db.reperes.where('photoId').anyOf(photos).delete()
  await db.photos.bulkDelete(photos)
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

export async function loadAnnotations(photoId: string): Promise<Annotations> {
  const [cotes, reperes] = await Promise.all([
    db.cotes.where('photoId').equals(photoId).toArray(),
    db.reperes.where('photoId').equals(photoId).toArray(),
  ])
  return { cotes, reperes }
}

/** Remplace tout le calque d'une photo en une seule transaction : pas d'état à moitié écrit. */
export async function saveAnnotations(photoId: string, ann: Annotations): Promise<void> {
  await db.transaction('rw', db.photos, db.cotes, db.reperes, async () => {
    await db.cotes.where('photoId').equals(photoId).delete()
    await db.reperes.where('photoId').equals(photoId).delete()
    await db.cotes.bulkPut(ann.cotes)
    await db.reperes.bulkPut(ann.reperes)
    await db.photos.update(photoId, { updatedAt: Date.now() })
  })
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
