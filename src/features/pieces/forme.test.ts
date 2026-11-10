import { describe, expect, it } from 'vitest'
import type { Chantier, MurPiece, Piece } from '../../models/types'
import { angleParDiagonale, contourMurs, controlerMurs, encombrement, surface } from './forme'
import { contenuFusion, controlerPiece } from './fusion'

const mur = (longueurMm: number | null, angleDeg = 90): MurPiece => ({ longueurMm, angleDeg })

describe('angleParDiagonale', () => {
  it('trouve 90° pour un triangle 3-4-5', () => {
    expect(angleParDiagonale(3000, 4000, 5000)).toBe(90)
  })

  it('trouve un coin ouvert ou fermé', () => {
    expect(angleParDiagonale(1000, 1000, 1000)).toBe(60)
    expect(angleParDiagonale(1000, 1000, Math.SQRT2 * 1000 * Math.cos(Math.PI / 8) * Math.SQRT2)).toBeCloseTo(135, 1)
  })

  it('refuse une diagonale impossible avec ces deux murs', () => {
    expect(angleParDiagonale(1000, 1000, 2500)).toBeNull()
    expect(angleParDiagonale(3000, 1000, 1500)).toBeNull()
    expect(angleParDiagonale(0, 1000, 1000)).toBeNull()
  })
})

describe('contourMurs', () => {
  it('referme un rectangle saisi mur par mur', () => {
    const c = contourMurs([mur(3600), mur(3000), mur(3600), mur(3000)])
    expect(c?.ecartMm).toBeLessThan(0.001)
    expect(c?.perimetreMm).toBe(13200)
    expect(c?.points.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([
      [0, 0],
      [3600, 0],
      [3600, 3000],
      [0, 3000],
    ])
    expect(surface(c!.points)).toBeCloseTo(3600 * 3000, 0)
  })

  it('referme une pièce à 5 côtés avec un pan coupé', () => {
    // Rectangle 4000 × 3000 dont un coin est coupé à 45° sur 1000 × 1000.
    const pan = Math.hypot(1000, 1000)
    const c = contourMurs([mur(4000), mur(2000, 135), mur(pan, 135), mur(3000), mur(3000)])
    expect(c?.ecartMm).toBeLessThan(0.001)
    expect(encombrement(c!.points)).toEqual({ largeurMm: 4000, profondeurMm: 3000 })
    expect(surface(c!.points)).toBeCloseTo(4000 * 3000 - 500_000, 0)
  })

  it("referme une pièce en L, avec son coin rentrant à 270°", () => {
    const c = contourMurs([mur(4000), mur(1500), mur(2000, 270), mur(1500), mur(2000), mur(3000)])
    expect(c?.ecartMm).toBeLessThan(0.001)
    expect(surface(c!.points)).toBeCloseTo(4000 * 1500 + 2000 * 1500, 0)
  })

  it("mesure ce qui manque quand une cote est fausse", () => {
    const c = contourMurs([mur(3600), mur(3000), mur(3500), mur(3000)])
    expect(c?.ecartMm).toBeCloseTo(100, 3)
  })

  it('attend que toutes les longueurs soient saisies', () => {
    expect(contourMurs([mur(3600), mur(null), mur(3600), mur(3000)])).toBeNull()
    expect(contourMurs([])).toBeNull()
  })
})

describe('controlerMurs', () => {
  it('accepte une pièce qui se referme, à 20 mm près', () => {
    expect(controlerMurs([mur(3600), mur(3000), mur(3600), mur(3000)])).toEqual([])
    expect(controlerMurs([mur(3600), mur(3000), mur(3585), mur(3000)])).toEqual([])
  })

  it('dit ce qui manque', () => {
    expect(controlerMurs([mur(3600), mur(3000)])).toEqual(['il faut au moins 3 murs'])
    expect(controlerMurs([mur(3600), mur(null), mur(3600), mur(null)])).toEqual(['longueur manquante : mur 2, 4'])
    expect(controlerMurs([mur(3600), mur(3000), mur(3500), mur(3000)])[0]).toContain('il manque 100 mm')
  })
})

describe('pièce mur par mur vers Fusion', () => {
  const chantier: Chantier = { id: 'c1', nom: 'Essai', client: '', adresse: '', contact: '', date: '2026-11-10', createdAt: 1, updatedAt: 1 }
  const pan = Math.hypot(1000, 1000)
  const piece: Piece = {
    id: 'p1',
    chantierId: 'c1',
    nom: 'Boutique',
    forme: 'murs',
    murs: [mur(4000), mur(2000, 135), mur(pan, 135), mur(3000), mur(3000)],
    largeurMm: 4000,
    profondeurMm: 3000,
    hauteurMm: 2600,
    remarque: '',
    createdAt: 1,
    updatedAt: 1,
  }

  it("contrôle le tour et la hauteur, pas l'encombrement", () => {
    expect(controlerPiece(piece)).toEqual([])
    // Un petit renfoncement de 800 mm de large reste valable : la limite de 1 000 mm ne vaut que pour un rectangle.
    expect(controlerPiece({ ...piece, largeurMm: 800 })).toEqual([])
    expect(controlerPiece({ ...piece, hauteurMm: null })).toEqual(['hauteur sous plafond manquante'])
    expect(controlerPiece({ ...piece, murs: piece.murs!.slice(0, 4) })[0]).toContain('ne se referme pas')
  })

  it('envoie les coins de la pièce à Fusion', () => {
    const [envoyee] = contenuFusion(chantier, [piece]).pieces
    expect(envoyee.contour_mm).toEqual([
      [0, 0],
      [4000, 0],
      [4000, 2000],
      [3000, 3000],
      [0, 3000],
    ])
    expect(envoyee.hauteur_mm).toBe(2600)
  })

  it("n'ajoute pas de contour à une pièce rectangulaire", () => {
    const rectangle: Piece = { ...piece, forme: 'rectangle', murs: undefined }
    expect(contenuFusion(chantier, [rectangle]).pieces[0].contour_mm).toBeUndefined()
  })
})
