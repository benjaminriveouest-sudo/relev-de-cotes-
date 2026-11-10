import type { Chantier, Piece } from '../../models/types'

/** Identifiant du fichier d'échange lu par Fusion by DRZ (Travaux › Relevé › Importer une pièce relevée). */
export const FORMAT_FUSION = 'releve-de-cotes/pieces'
export const VERSION_FUSION = 1

/**
 * Limites d'une pièce dans Fusion by DRZ (agencement.py, ENV_PIECE) : une pièce « prête » ici est une pièce que
 * Fusion accepte. En dessous du mini, la cote a le plus souvent été saisie en centimètres ou en mètres.
 */
export const LIMITES_MM = {
  largeur: { mini: 1000, maxi: 12_000 },
  profondeur: { mini: 1000, maxi: 12_000 },
  hauteur: { mini: 2000, maxi: 4000 },
} as const

export interface PieceFusion {
  nom: string
  largeur_mm: number
  profondeur_mm: number
  hauteur_mm: number
  remarque: string
}

export interface FichierFusion {
  format: typeof FORMAT_FUSION
  version: number
  exporte_le: string
  chantier: { nom: string; client: string; adresse: string }
  pieces: PieceFusion[]
}

/** Texte saisi (« 3 600 », « 3600,5 ») → millimètres, ou null si vide ou illisible. */
export function lireCote(texte: string): number | null {
  const propre = texte.replace(/\s/g, '').replace(',', '.')
  if (!propre) return null
  const v = Number(propre)
  return Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : null
}

/** Ce qui manque ou paraît faux dans une pièce, en clair ; vide si elle peut partir dans Fusion. */
export function controlerPiece(piece: Pick<Piece, 'largeurMm' | 'profondeurMm' | 'hauteurMm'>): string[] {
  const soucis: string[] = []
  const cotes: [string, number | null, { mini: number; maxi: number }][] = [
    ['largeur', piece.largeurMm, LIMITES_MM.largeur],
    ['profondeur', piece.profondeurMm, LIMITES_MM.profondeur],
    ['hauteur sous plafond', piece.hauteurMm, LIMITES_MM.hauteur],
  ]
  for (const [nom, v, { mini, maxi }] of cotes) {
    if (v == null) soucis.push(`${nom} manquante`)
    else if (v < mini) soucis.push(`${nom} de ${v} mm, sous les ${mini} mm : saisie en cm ou en m ?`)
    else if (v > maxi) soucis.push(`${nom} de ${v} mm, au-delà des ${maxi} mm acceptés par Fusion`)
  }
  return soucis
}

export const pieceComplete = (piece: Piece) => controlerPiece(piece).length === 0

/** Contenu du fichier d'échange : seulement les pièces complètes, dans l'ordre de saisie. */
export function contenuFusion(chantier: Chantier, pieces: Piece[], maintenant = new Date()): FichierFusion {
  return {
    format: FORMAT_FUSION,
    version: VERSION_FUSION,
    exporte_le: maintenant.toISOString(),
    chantier: { nom: chantier.nom, client: chantier.client, adresse: chantier.adresse },
    pieces: pieces.filter(pieceComplete).map((p) => ({
      nom: p.nom.trim() || 'Pièce',
      largeur_mm: p.largeurMm as number,
      profondeur_mm: p.profondeurMm as number,
      hauteur_mm: p.hauteurMm as number,
      remarque: p.remarque.trim(),
    })),
  }
}

/** Nom de fichier sans caractère interdit sous Windows. */
export function nomFichierFusion(chantier: Chantier): string {
  const base = chantier.nom.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Chantier'
  return `${base} - pieces.fusion.json`
}

export function fichierFusion(chantier: Chantier, pieces: Piece[]): File {
  const texte = JSON.stringify(contenuFusion(chantier, pieces), null, 2)
  return new File([texte], nomFichierFusion(chantier), { type: 'application/json' })
}
