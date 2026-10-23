import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addPhoto, db, deletePhoto, saveAnnotations, saveChantier, saveOuvrage } from '../db/db'
import type { Chantier, Ouvrage, Photo } from '../models/types'
import { envoyer, nombreEnAttente, preparerEntreprise, recevoir, synchroniser } from './moteur'
import type { Ligne, LigneLue, Serveur } from './serveur'

const ENT = 'ent-1'

/** Imitation du serveur : la plus récente gagne, comme le déclencheur SQL. */
class FauxServeur implements Serveur {
  lignes = new Map<string, LigneLue>()
  fichiers = new Map<string, Blob>()
  depots: string[] = []
  private horloge = Date.parse('2026-10-23T10:00:00Z')

  async envoyer(lignes: Ligne[]) {
    // Comme les règles d'accès : tout le paquet est refusé si une ligne appartient à une autre entreprise.
    if (lignes.some((l) => this.lignes.has(l.id) && this.lignes.get(l.id)!.entreprise_id !== l.entreprise_id))
      throw new Error('Envoi des relevés : new row violates row-level security policy (USING expression)')
    for (const l of lignes) this.ecrire(l)
  }
  ecrire(l: Ligne) {
    const ancien = this.lignes.get(l.id)
    if (ancien && ancien.updated_at > l.updated_at) return
    this.horloge += 1000
    this.lignes.set(l.id, { ...structuredClone(l), server_updated_at: new Date(this.horloge).toISOString() })
  }
  async lire(depuis: string | null, debut: number, nombre: number) {
    return [...this.lignes.values()]
      .filter((l) => !depuis || l.server_updated_at > depuis)
      .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
      .slice(debut, debut + nombre)
  }
  async deposerFichier(chemin: string, fichier: Blob) {
    this.depots.push(chemin)
    this.fichiers.set(chemin, fichier)
  }
  async telechargerFichier(chemin: string) {
    const f = this.fichiers.get(chemin)
    if (!f) throw new Error('fichier absent ' + chemin)
    return new Blob([await f.arrayBuffer()])
  }
  async supprimerFichiers(chemins: string[]) {
    for (const c of chemins) this.fichiers.delete(c)
  }
}

const chantier = (id: string, nom = 'Villa'): Chantier => ({
  id,
  nom,
  client: '',
  adresse: '',
  contact: '',
  date: '2026-10-23',
  createdAt: 1,
  updatedAt: 1,
})

const ouvrage = (id: string, chantierId: string): Ouvrage => ({
  id,
  chantierId,
  type: 'Garde-corps',
  repere: 'GC1',
  localisation: '',
  statut: 'a_relever',
  createdAt: 1,
  updatedAt: 1,
})

const photo = (id: string, ouvrageId: string): Photo => ({
  id,
  ouvrageId,
  blob: new Blob(['image'], { type: 'image/jpeg' }),
  thumb: new Blob(['mini'], { type: 'image/jpeg' }),
  width: 100,
  height: 80,
  createdAt: 5,
  updatedAt: 5,
})

let serveur: FauxServeur

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  serveur = new FauxServeur()
})

describe('file d’envoi', () => {
  it('note chaque écriture et chaque suppression', async () => {
    await saveChantier(chantier('c1'))
    await saveOuvrage(ouvrage('o1', 'c1'))
    expect((await db.envois.toArray()).map((e) => `${e.cle}:${e.op}`).sort()).toEqual([
      'chantiers:c1:put',
      'ouvrages:o1:put',
    ])
    await addPhoto(photo('p1', 'o1'))
    await deletePhoto('p1')
    expect((await db.envois.get('photos:p1'))?.op).toBe('delete')
  })

  it('n’ajoute les données déjà présentes qu’à la première connexion à l’entreprise', async () => {
    await db.chantiers.put(chantier('c1'))
    await db.envois.clear()
    await preparerEntreprise(ENT)
    expect(await nombreEnAttente()).toBe(1)
    await db.envois.clear()
    await preparerEntreprise(ENT)
    expect(await nombreEnAttente()).toBe(0)
  })
})

describe('envoi', () => {
  it('envoie les objets, les photos à part, et vide la file', async () => {
    await preparerEntreprise(ENT)
    await saveChantier(chantier('c1'))
    await saveOuvrage(ouvrage('o1', 'c1'))
    await addPhoto(photo('p1', 'o1'))
    await envoyer(serveur, ENT)

    expect(await nombreEnAttente()).toBe(0)
    const p = serveur.lignes.get('p1')!
    expect(p.table_name).toBe('photos')
    expect(p.data.blob).toBeUndefined()
    expect(p.data._fichiers).toEqual({ blob: { taille: 5, type: 'image/jpeg' }, thumb: { taille: 4, type: 'image/jpeg' } })
    expect(serveur.depots.sort()).toEqual([`${ENT}/photos/p1/blob`, `${ENT}/photos/p1/thumb`])
  })

  it('ne renvoie pas la photo quand seules ses cotes changent', async () => {
    await preparerEntreprise(ENT)
    await addPhoto(photo('p1', 'o1'))
    await envoyer(serveur, ENT)
    serveur.depots = []
    await saveAnnotations('p1', {
      cotes: [{ id: 'k1', photoId: 'p1', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, valeurMm: 1200, libelle: '', updatedAt: 9 }],
      reperes: [],
      traits: [],
    })
    await envoyer(serveur, ENT)
    expect(serveur.depots).toEqual([])
    expect(serveur.lignes.get('k1')?.data.valeurMm).toBe(1200)
  })

  it('transmet une suppression et efface les fichiers', async () => {
    await preparerEntreprise(ENT)
    await addPhoto(photo('p1', 'o1'))
    await envoyer(serveur, ENT)
    await deletePhoto('p1')
    await envoyer(serveur, ENT)
    expect(serveur.lignes.get('p1')?.deleted).toBe(true)
    expect(serveur.fichiers.size).toBe(0)
  })
})

describe('changement d’entreprise sur un même appareil', () => {
  it('renvoie les photos dans la nouvelle entreprise', async () => {
    await preparerEntreprise(ENT)
    await addPhoto(photo('p1', 'o1'))
    await envoyer(serveur, ENT)
    serveur = new FauxServeur()
    await preparerEntreprise('ent-2')
    await envoyer(serveur, 'ent-2')
    expect(serveur.depots.sort()).toEqual(['ent-2/photos/p1/blob', 'ent-2/photos/p1/thumb'])
  })

  it('garde sur l’appareil ce qui appartient déjà à une autre entreprise, et envoie le reste', async () => {
    await preparerEntreprise(ENT)
    await saveChantier(chantier('c1'))
    await envoyer(serveur, ENT)
    await preparerEntreprise('ent-2')
    await saveChantier(chantier('c2'))
    expect(await envoyer(serveur, 'ent-2')).toEqual({ envoyes: 1, refuses: 1 })
    expect(serveur.lignes.get('c2')?.entreprise_id).toBe('ent-2')
    expect(serveur.lignes.get('c1')?.entreprise_id).toBe(ENT)
    expect(await nombreEnAttente()).toBe(0)
  })
})

describe('réception', () => {
  it('récupère les objets des collègues avec leurs fichiers, sans les renvoyer', async () => {
    await preparerEntreprise(ENT)
    serveur.ecrire({ id: 'c9', entreprise_id: ENT, table_name: 'chantiers', data: { ...chantier('c9', 'Chez Paul') }, updated_at: 1, deleted: false })
    await serveur.deposerFichier(`${ENT}/photos/p9/blob`, new Blob(['image']))
    await serveur.deposerFichier(`${ENT}/photos/p9/thumb`, new Blob(['mini']))
    const { blob: _b, thumb: _t, ...data } = photo('p9', 'o9')
    serveur.ecrire({
      id: 'p9',
      entreprise_id: ENT,
      table_name: 'photos',
      data: { ...data, _fichiers: { blob: { taille: 5, type: 'image/jpeg' }, thumb: { taille: 4, type: 'image/jpeg' } } },
      updated_at: 5,
      deleted: false,
    })

    expect(await recevoir(serveur)).toBe(2)
    expect((await db.chantiers.get('c9'))?.nom).toBe('Chez Paul')
    const p = await db.photos.get('p9')
    expect(p?.blob.type).toBe('image/jpeg')
    expect(await p?.blob.text()).toBe('image')
    expect(await nombreEnAttente()).toBe(0)

    // Relecture avec la marge : rien de neuf, rien n'est réécrit.
    expect(await recevoir(serveur)).toBe(0)
  })

  it('garde une modification locale plus récente, cède à une plus récente du serveur', async () => {
    await preparerEntreprise(ENT)
    await db.chantiers.put({ ...chantier('c1', 'Local'), updatedAt: 100 })
    serveur.ecrire({ id: 'c1', entreprise_id: ENT, table_name: 'chantiers', data: { ...chantier('c1', 'Ancien'), updatedAt: 50 }, updated_at: 50, deleted: false })
    await recevoir(serveur)
    expect((await db.chantiers.get('c1'))?.nom).toBe('Local')
    expect(await nombreEnAttente()).toBe(1)

    serveur.ecrire({ id: 'c1', entreprise_id: ENT, table_name: 'chantiers', data: { ...chantier('c1', 'Bureau'), updatedAt: 200 }, updated_at: 200, deleted: false })
    await recevoir(serveur)
    expect((await db.chantiers.get('c1'))?.nom).toBe('Bureau')
    expect(await nombreEnAttente()).toBe(0)
  })

  it('applique une suppression faite par un collègue', async () => {
    await preparerEntreprise(ENT)
    await db.chantiers.put(chantier('c1'))
    await synchroniser(serveur, ENT)
    serveur.ecrire({ id: 'c1', entreprise_id: ENT, table_name: 'chantiers', data: {}, updated_at: Date.now(), deleted: true })
    await recevoir(serveur)
    expect(await db.chantiers.get('c1')).toBeUndefined()
    expect(await nombreEnAttente()).toBe(0)
  })
})
