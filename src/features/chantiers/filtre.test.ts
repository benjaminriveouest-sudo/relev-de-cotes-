import { describe, expect, it } from 'vitest'
import type { ChantierResume } from '../../db/db'
import { filtrerChantiers } from './filtre'

function resume(nom: string, client: string, adresse: string, a_relever = 0, releve = 0, valide = 0): ChantierResume {
  return {
    chantier: { id: nom, nom, client, adresse, contact: '', date: '2026-10-23', createdAt: 1, updatedAt: 1 },
    statuts: { a_relever, releve, valide },
  }
}

const liste = [
  resume('Résidence Les Pins', 'Durand', '12 rue de la Gare, Nantes', 2, 0, 0),
  resume('Maison Martin', 'Martin', 'Rezé', 0, 1, 0),
  resume('École Jules Ferry', 'Mairie', 'Nantes', 0, 0, 3),
]

const noms = (l: ChantierResume[]) => l.map((r) => r.chantier.nom)

describe('recherche et filtre des chantiers', () => {
  it('sans critère, garde tout', () => {
    expect(noms(filtrerChantiers(liste, '  ', null))).toHaveLength(3)
  })

  it('cherche dans le nom, le client et l’adresse, sans tenir compte des accents ni des majuscules', () => {
    expect(noms(filtrerChantiers(liste, 'ecole', null))).toEqual(['École Jules Ferry'])
    expect(noms(filtrerChantiers(liste, 'DURAND', null))).toEqual(['Résidence Les Pins'])
    expect(noms(filtrerChantiers(liste, 'nantes', null))).toEqual(['Résidence Les Pins', 'École Jules Ferry'])
  })

  it('exige tous les mots tapés', () => {
    expect(noms(filtrerChantiers(liste, 'nantes gare', null))).toEqual(['Résidence Les Pins'])
  })

  it('filtre sur les chantiers ayant au moins un ouvrage dans le statut choisi', () => {
    expect(noms(filtrerChantiers(liste, '', 'releve'))).toEqual(['Maison Martin'])
    expect(noms(filtrerChantiers(liste, 'nantes', 'valide'))).toEqual(['École Jules Ferry'])
  })
})
