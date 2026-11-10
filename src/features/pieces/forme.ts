import type { MurPiece, Point } from '../../models/types'

/** Écart toléré entre le bout du dernier mur et le point de départ : au-delà, la pièce « ne se referme pas ». */
export const TOLERANCE_FERMETURE_MM = 20

/**
 * Angle intérieur (degrés) du coin entre deux murs voisins de longueurs a et b, quand la diagonale qui joint
 * leurs deux bouts libres mesure d (loi des cosinus). null si ces trois cotes ne font pas un triangle.
 */
export function angleParDiagonale(a: number, b: number, d: number): number | null {
  if (!(a > 0 && b > 0 && d > 0)) return null
  if (d >= a + b || d <= Math.abs(a - b)) return null
  const cos = (a * a + b * b - d * d) / (2 * a * b)
  return Math.round((Math.acos(Math.max(-1, Math.min(1, cos))) * 180 * 100) / Math.PI) / 100
}

export interface Contour {
  /** Coins de la pièce dans l'ordre du tour, en mm ; le premier est (0, 0). */
  points: Point[]
  /** Où arrive le bout du dernier mur : confondu avec le premier coin si la pièce se referme. */
  fin: Point
  /** Distance entre ce bout et le premier coin. */
  ecartMm: number
  perimetreMm: number
}

/**
 * Tour de la pièce : chaque mur part du bout du précédent ; au coin, on tourne de (180° − angle intérieur),
 * toujours dans le même sens. null tant qu'une longueur manque.
 */
export function contourMurs(murs: MurPiece[]): Contour | null {
  if (murs.length === 0 || murs.some((m) => !(m.longueurMm && m.longueurMm > 0))) return null
  const points: Point[] = []
  let x = 0
  let y = 0
  let cap = 0
  let perimetre = 0
  for (const m of murs) {
    points.push({ x, y })
    const l = m.longueurMm as number
    x += l * Math.cos((cap * Math.PI) / 180)
    y += l * Math.sin((cap * Math.PI) / 180)
    perimetre += l
    cap += 180 - m.angleDeg
  }
  return { points, fin: { x, y }, ecartMm: Math.hypot(x, y), perimetreMm: perimetre }
}

/** Surface (mm², positive) d'un contour fermé. */
export function surface(points: Point[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

export interface Encombrement {
  largeurMm: number
  profondeurMm: number
}

/** Rectangle qui contient la pièce (pour l'afficher dans la liste, pas pour la fabriquer). */
export function encombrement(points: Point[]): Encombrement {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    largeurMm: Math.round((Math.max(...xs) - Math.min(...xs)) * 10) / 10,
    profondeurMm: Math.round((Math.max(...ys) - Math.min(...ys)) * 10) / 10,
  }
}

/** Ce qui empêche d'envoyer une pièce saisie mur par mur ; vide si sa forme est bonne. */
export function controlerMurs(murs: MurPiece[]): string[] {
  if (murs.length < 3) return ['il faut au moins 3 murs']
  const manquants = murs.map((m, i) => (m.longueurMm && m.longueurMm > 0 ? 0 : i + 1)).filter(Boolean)
  if (manquants.length) return [`longueur manquante : mur ${manquants.join(', ')}`]
  const angles = murs.slice(0, -1).some((m) => !(m.angleDeg > 0 && m.angleDeg < 360))
  if (angles) return ['un angle doit être entre 1° et 359°']
  const contour = contourMurs(murs)
  if (!contour) return ['forme illisible']
  if (contour.ecartMm > TOLERANCE_FERMETURE_MM) {
    return [`la pièce ne se referme pas : il manque ${Math.round(contour.ecartMm)} mm entre le dernier mur et le départ`]
  }
  if (surface(contour.points) < 1) return ['la pièce est plate : vérifiez les angles']
  return []
}
