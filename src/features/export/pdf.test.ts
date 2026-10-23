import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { Chantier, Ouvrage } from '../../models/types'
import { nomFichier } from './exporter'
import { couper, creerPdfChantier, creerPdfOuvrage, nettoyer, type FichePdf, type ImagePdf } from './pdf'

// PNG 1 × 1 pixel blanc.
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC'),
  (c) => c.charCodeAt(0),
)
const image = (legende: string): ImagePdf => ({ octets: PNG, format: 'png', legende })

const chantier: Chantier = {
  id: 'c1',
  nom: 'Résidence Les Tilleuls',
  client: 'SCI Durand',
  adresse: '12 rue des Lilas, 69000 Lyon',
  contact: 'M. Martin 06 00 00 00 00',
  date: '2026-10-23',
  createdAt: 0,
  updatedAt: 0,
}

function ouvrage(id: string, statut: Ouvrage['statut'] = 'releve'): Ouvrage {
  return { id, chantierId: 'c1', type: 'Garde-corps', repere: id, localisation: 'Façade sud, R+1', statut, createdAt: 0, updatedAt: 0 }
}

function fiche(o: Ouvrage, nbPhotos: number, nbCroquis: number): FichePdf {
  return {
    chantier,
    ouvrage: o,
    note: { id: 'n', ouvrageId: o.id, texte: 'Support béton fissuré 👀 → prévoir reprise.\nAccès par la cour.', cases: ['support.beton', 'acces.nacelle'], updatedAt: 0 },
    notesVocales: { nombre: 2, dureeMs: 75_000 },
    photos: Array.from({ length: nbPhotos }, (_, i) => image(`Photo ${i}`)),
    croquis: Array.from({ length: nbCroquis }, (_, i) => image(`Croquis ${i}`)),
    dateReleve: Date.UTC(2026, 9, 23, 10),
  }
}

const infos = { auteur: 'Benjamin', date: new Date(Date.UTC(2026, 9, 23, 12)) }

describe('PDF', () => {
  it("fiche d'un ouvrage : une page de synthèse, puis une page par photo et par croquis", async () => {
    const octets = await creerPdfOuvrage(fiche(ouvrage('GC1'), 2, 1), infos)
    const doc = await PDFDocument.load(octets)
    expect(doc.getPageCount()).toBe(4)
    expect(doc.getTitle()).toBe('Relevé Résidence Les Tilleuls · Garde-corps · GC1')
  })

  it('chantier complet : sommaire puis toutes les fiches, chargées une par une', async () => {
    const ouvrages = [ouvrage('GC1'), ouvrage('GC2', 'a_relever'), ouvrage('P1', 'valide')]
    const charges: string[] = []
    const octets = await creerPdfChantier(
      chantier,
      ouvrages,
      async (o) => {
        charges.push(o.id)
        return fiche(o, 1, 0)
      },
      infos,
    )
    expect(charges).toEqual(['GC1', 'GC2', 'P1'])
    expect((await PDFDocument.load(octets)).getPageCount()).toBe(1 + 3 * 2)
  })

  it('un long sommaire déborde sur plusieurs pages', async () => {
    const ouvrages = Array.from({ length: 60 }, (_, i) => ouvrage(`GC${i}`))
    const octets = await creerPdfChantier(chantier, ouvrages, async (o) => fiche(o, 0, 0), infos)
    const pages = (await PDFDocument.load(octets)).getPageCount()
    expect(pages).toBeGreaterThan(61)
  })

  it('chantier sans ouvrage', async () => {
    const octets = await creerPdfChantier(chantier, [], async () => fiche(ouvrage('x'), 0, 0), infos)
    expect((await PDFDocument.load(octets)).getPageCount()).toBe(1)
  })
})

describe('texte', () => {
  it('remplace les caractères que le PDF ne sait pas écrire et garde les accents', async () => {
    const police = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
    expect(nettoyer('Façade « sud » → œil 😀', police)).toBe('Façade « sud » ? œil ?')
  })

  it('coupe les lignes trop longues, y compris un mot sans espace', async () => {
    const police = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
    const lignes = couper(`court\n${'x'.repeat(200)}`, police, 11, 100)
    expect(lignes[0]).toBe('court')
    expect(lignes.length).toBeGreaterThan(3)
    for (const l of lignes) expect(police.widthOfTextAtSize(l, 11)).toBeLessThanOrEqual(100)
  })

  it('nom de fichier sans caractères interdits', () => {
    expect(nomFichier('Releve', 'Bât. A/B', 'Garde-corps', '')).toBe('Releve - Bat. A B - Garde-corps.pdf')
    expect(nomFichier('Œuvre 🏗️ façade')).toBe('Oeuvre facade.pdf')
    expect(nomFichier('', ' ')).toBe('Releve.pdf')
  })
})
