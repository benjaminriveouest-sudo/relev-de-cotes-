import { describe, expect, it } from 'vitest'
import type { Chantier, Piece } from '../../models/types'
import { contenuFusion, controlerPiece, FORMAT_FUSION, lireCote, nomFichierFusion, pieceComplete } from './fusion'

const chantier: Chantier = {
  id: 'c1',
  nom: 'Boutique : rue / centre',
  client: 'Client',
  adresse: '1 rue du Test',
  contact: '',
  date: '2026-11-10',
  createdAt: 1,
  updatedAt: 1,
}

function piece(nom: string, l: number | null, p: number | null, h: number | null, createdAt = 1): Piece {
  return { id: nom, chantierId: 'c1', nom, largeurMm: l, profondeurMm: p, hauteurMm: h, remarque: '', createdAt, updatedAt: createdAt }
}

describe('lireCote', () => {
  it('lit les milliers avec espace et la virgule décimale', () => {
    expect(lireCote('3 600')).toBe(3600)
    expect(lireCote('3600,5')).toBe(3600.5)
    expect(lireCote(' 2500 ')).toBe(2500)
  })

  it('rend null pour un champ vide, un texte ou une valeur nulle', () => {
    expect(lireCote('')).toBeNull()
    expect(lireCote('abc')).toBeNull()
    expect(lireCote('0')).toBeNull()
    expect(lireCote('-12')).toBeNull()
  })
})

describe('controlerPiece', () => {
  it('accepte une pièce complète', () => {
    expect(controlerPiece(piece('Boutique', 3600, 3000, 2500))).toEqual([])
    expect(pieceComplete(piece('Boutique', 3600, 3000, 2500))).toBe(true)
  })

  it('signale chaque cote manquante', () => {
    expect(controlerPiece(piece('Boutique', 3600, null, null))).toEqual(['profondeur manquante', 'hauteur sous plafond manquante'])
  })

  it('signale une cote saisie en centimètres ou en mètres', () => {
    const soucis = controlerPiece(piece('Boutique', 482, 3000, 2.5))
    expect(soucis).toHaveLength(2)
    expect(soucis[0]).toContain('largeur de 482 mm')
    expect(soucis[1]).toContain('hauteur sous plafond de 2.5 mm')
  })

  it("refuse ce que Fusion refuserait : mêmes limites que la pièce de l'agencement", () => {
    expect(controlerPiece(piece('Boutique', 1000, 12000, 2000))).toEqual([])
    expect(controlerPiece(piece('Boutique', 999, 12001, 4001))).toHaveLength(3)
  })
})

describe('contenuFusion', () => {
  it("ne garde que les pièces complètes, avec le chantier et le format attendu par Fusion", () => {
    const contenu = contenuFusion(
      chantier,
      [piece('Boutique', 3600, 3000, 2500), piece('Réserve', 2000, null, 2400), piece('  ', 1800, 1500, 2400)],
      new Date('2026-11-10T12:00:00Z'),
    )
    expect(contenu.format).toBe(FORMAT_FUSION)
    expect(contenu.version).toBe(1)
    expect(contenu.exporte_le).toBe('2026-11-10T12:00:00.000Z')
    expect(contenu.chantier).toEqual({ nom: 'Boutique : rue / centre', client: 'Client', adresse: '1 rue du Test' })
    expect(contenu.pieces).toEqual([
      { nom: 'Boutique', largeur_mm: 3600, profondeur_mm: 3000, hauteur_mm: 2500, remarque: '' },
      { nom: 'Pièce', largeur_mm: 1800, profondeur_mm: 1500, hauteur_mm: 2400, remarque: '' },
    ])
  })
})

describe('nomFichierFusion', () => {
  it('retire les caractères interdits dans un nom de fichier Windows', () => {
    expect(nomFichierFusion(chantier)).toBe('Boutique rue centre - pieces.fusion.json')
    expect(nomFichierFusion({ ...chantier, nom: '  ' })).toBe('Chantier - pieces.fusion.json')
  })
})
