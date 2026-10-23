import Dexie, { type Table } from 'dexie'
import type { Annotations, Cote, Photo, Repere } from '../models/types'

class RelevesDB extends Dexie {
  photos!: Table<Photo, string>
  cotes!: Table<Cote, string>
  reperes!: Table<Repere, string>

  constructor() {
    super('releve-de-cotes')
    this.version(1).stores({
      photos: 'id, createdAt',
      cotes: 'id, photoId',
      reperes: 'id, photoId',
    })
  }
}

export const db = new RelevesDB()

export interface PhotoResume {
  photo: Photo
  nbCotes: number
}

export async function listPhotos(): Promise<PhotoResume[]> {
  const photos = await db.photos.orderBy('createdAt').reverse().toArray()
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
