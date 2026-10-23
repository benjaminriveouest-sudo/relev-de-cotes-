import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Annotations, Chantier, Ouvrage, Photo, StatutOuvrage } from '../models/types'
import {
  addPhoto,
  db,
  deleteChantier,
  deleteOuvrage,
  deletePhoto,
  getChantier,
  listChantiers,
  listOuvrages,
  listPhotos,
  loadAnnotations,
  NOM_BASE,
  saveAnnotations,
  saveChantier,
  saveOuvrage,
} from './db'

function photo(id: string, createdAt: number, ouvrageId = 'o1'): Photo {
  return {
    id,
    ouvrageId,
    blob: new Blob(['x']),
    thumb: new Blob(['y']),
    width: 100,
    height: 80,
    createdAt,
    updatedAt: createdAt,
  }
}

function chantier(id: string): Chantier {
  return { id, nom: `Chantier ${id}`, client: '', adresse: '', contact: '', date: '2026-10-23', createdAt: 1, updatedAt: 1 }
}

function ouvrage(id: string, chantierId: string, statut: StatutOuvrage = 'a_relever', createdAt = 1): Ouvrage {
  return { id, chantierId, type: 'Garde-corps', repere: id, localisation: '', statut, createdAt, updatedAt: createdAt }
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
    await addPhoto(photo('ailleurs', 3, 'o2'))
    const liste = await listPhotos('o1')
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

describe('chantiers et ouvrages', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('compte les ouvrages de chaque chantier par statut', async () => {
    await saveChantier(chantier('c1'))
    await saveChantier(chantier('c2'))
    await saveOuvrage(ouvrage('o1', 'c1', 'a_relever'))
    await saveOuvrage(ouvrage('o2', 'c1', 'releve'))
    await saveOuvrage(ouvrage('o3', 'c1', 'releve'))
    const liste = await listChantiers()
    expect(liste.find((r) => r.chantier.id === 'c1')?.statuts).toEqual({ a_relever: 1, releve: 2, valide: 0 })
    expect(liste.find((r) => r.chantier.id === 'c2')?.statuts).toEqual({ a_relever: 0, releve: 0, valide: 0 })
  })

  it('le dernier chantier modifié passe en tête', async () => {
    await saveChantier(chantier('c1'))
    await new Promise((r) => setTimeout(r, 5))
    await saveChantier(chantier('c2'))
    await new Promise((r) => setTimeout(r, 5))
    await saveOuvrage(ouvrage('o1', 'c1'))
    expect((await listChantiers()).map((r) => r.chantier.id)).toEqual(['c1', 'c2'])
  })

  it('liste les ouvrages d’un chantier dans l’ordre de création, avec leur nombre de photos', async () => {
    await saveOuvrage(ouvrage('o2', 'c1', 'a_relever', 2))
    await saveOuvrage(ouvrage('o1', 'c1', 'a_relever', 1))
    await saveOuvrage(ouvrage('autre', 'c2'))
    await addPhoto(photo('p1', 1, 'o2'))
    const liste = await listOuvrages('c1')
    expect(liste.map((r) => [r.ouvrage.id, r.nbPhotos])).toEqual([
      ['o1', 0],
      ['o2', 1],
    ])
  })

  it('supprimer un ouvrage supprime ses photos et leurs cotes, rien d’autre', async () => {
    await saveOuvrage(ouvrage('o1', 'c1'))
    await saveOuvrage(ouvrage('o2', 'c1'))
    await addPhoto(photo('p1', 1, 'o1'))
    await addPhoto(photo('p2', 2, 'o2'))
    await saveAnnotations('p1', calque('p1', 2))
    await saveAnnotations('p2', calque('p2', 2))
    await deleteOuvrage('o1')
    expect(await db.ouvrages.count()).toBe(1)
    expect((await db.photos.toArray()).map((p) => p.id)).toEqual(['p2'])
    expect(await db.cotes.count()).toBe(2)
    expect(await db.reperes.count()).toBe(1)
  })

  it('supprimer un chantier supprime tout son contenu', async () => {
    await saveChantier(chantier('c1'))
    await saveChantier(chantier('c2'))
    await saveOuvrage(ouvrage('o1', 'c1'))
    await saveOuvrage(ouvrage('o2', 'c2'))
    await addPhoto(photo('p1', 1, 'o1'))
    await addPhoto(photo('p2', 2, 'o2'))
    await saveAnnotations('p1', calque('p1', 1))
    await deleteChantier('c1')
    expect(await getChantier('c1')).toBeUndefined()
    expect((await db.ouvrages.toArray()).map((o) => o.id)).toEqual(['o2'])
    expect((await db.photos.toArray()).map((p) => p.id)).toEqual(['p2'])
    expect(await db.cotes.count()).toBe(0)
  })
})

describe('mise à jour depuis l’étape 1', () => {
  it('range les anciennes photos dans un chantier « Photos de l’étape 1 », sans perdre les cotes', async () => {
    db.close()
    await Dexie.delete(NOM_BASE)
    const ancienne = new Dexie(NOM_BASE)
    ancienne.version(1).stores({ photos: 'id, createdAt', cotes: 'id, photoId', reperes: 'id, photoId' })
    const { ouvrageId: _, ...sansOuvrage } = photo('p1', 1)
    await ancienne.table('photos').add(sansOuvrage)
    await ancienne.table('photos').add({ ...sansOuvrage, id: 'p2', createdAt: 2 })
    await ancienne.table('cotes').bulkAdd(calque('p1', 3).cotes)
    ancienne.close()

    await db.open()
    const chantiers = await listChantiers()
    expect(chantiers.map((r) => r.chantier.nom)).toEqual(["Photos de l'étape 1"])
    const ouvrages = await listOuvrages(chantiers[0].chantier.id)
    expect(ouvrages.map((r) => [r.ouvrage.repere, r.nbPhotos])).toEqual([['Photos à classer', 2]])
    expect((await loadAnnotations('p1')).cotes).toHaveLength(3)
  })

  it('ne crée rien si l’appli était vide', async () => {
    db.close()
    await Dexie.delete(NOM_BASE)
    const ancienne = new Dexie(NOM_BASE)
    ancienne.version(1).stores({ photos: 'id, createdAt', cotes: 'id, photoId', reperes: 'id, photoId' })
    await ancienne.open()
    ancienne.close()

    await db.open()
    expect(await db.chantiers.count()).toBe(0)
  })
})
