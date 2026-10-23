import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Annotations, Photo } from '../models/types'
import { addPhoto, db, deletePhoto, listPhotos, loadAnnotations, saveAnnotations } from './db'

function photo(id: string, createdAt: number): Photo {
  return { id, blob: new Blob(['x']), thumb: new Blob(['y']), width: 100, height: 80, createdAt, updatedAt: createdAt }
}

function calque(photoId: string, n: number): Annotations {
  return {
    cotes: Array.from({ length: n }, (_, i) => ({
      id: `${photoId}-c${i}`,
      photoId,
      a: { x: 0, y: 0 },
      b: { x: 10, y: i },
      valeurMm: 1000 + i,
      libelle: '',
      updatedAt: 1,
    })),
    reperes: [{ id: `${photoId}-r`, photoId, position: { x: 5, y: 5 }, texte: 'Axe poteau', updatedAt: 1 }],
  }
}

describe('stockage local', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('sauvegarde et relit le calque d’une photo', async () => {
    await addPhoto(photo('p1', 1))
    await saveAnnotations('p1', calque('p1', 3))
    const ann = await loadAnnotations('p1')
    expect(ann.cotes.map((c) => c.valeurMm).sort()).toEqual([1000, 1001, 1002])
    expect(ann.reperes[0].texte).toBe('Axe poteau')
  })

  it('remplace le calque sans garder les cotes supprimées', async () => {
    await addPhoto(photo('p1', 1))
    await saveAnnotations('p1', calque('p1', 3))
    await saveAnnotations('p1', calque('p1', 1))
    expect((await loadAnnotations('p1')).cotes).toHaveLength(1)
  })

  it('liste les photos, la plus récente d’abord, avec leur nombre de cotes', async () => {
    await addPhoto(photo('ancienne', 1))
    await addPhoto(photo('recente', 2))
    await saveAnnotations('ancienne', calque('ancienne', 2))
    const liste = await listPhotos()
    expect(liste.map((p) => [p.photo.id, p.nbCotes])).toEqual([
      ['recente', 0],
      ['ancienne', 2],
    ])
  })

  it('supprimer une photo supprime ses annotations, pas celles des autres', async () => {
    await addPhoto(photo('p1', 1))
    await addPhoto(photo('p2', 2))
    await saveAnnotations('p1', calque('p1', 2))
    await saveAnnotations('p2', calque('p2', 2))
    await deletePhoto('p1')
    expect(await db.photos.count()).toBe(1)
    expect((await loadAnnotations('p1')).cotes).toHaveLength(0)
    expect((await loadAnnotations('p2')).cotes).toHaveLength(2)
  })
})
