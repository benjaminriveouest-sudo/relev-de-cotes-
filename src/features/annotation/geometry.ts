import type { Point } from '../../models/types'

/** Passage image → écran : écran = image × scale + (x, y). */
export interface View {
  scale: number
  x: number
  y: number
}

export const toScreen = (p: Point, v: View): Point => ({ x: p.x * v.scale + v.x, y: p.y * v.scale + v.y })
export const toImage = (p: Point, v: View): Point => ({ x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale })

export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)
export const milieu = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return distance(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** Vue qui fait tenir toute l'image dans le cadre, centrée. */
export function fitView(imgW: number, imgH: number, boxW: number, boxH: number, marge = 8): View {
  const scale = Math.min((boxW - 2 * marge) / imgW, (boxH - 2 * marge) / imgH)
  return { scale, x: (boxW - imgW * scale) / 2, y: (boxH - imgH * scale) / 2 }
}

export function clampScale(scale: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, scale))
}

/** Zoom autour d'un point écran fixe. */
export function zoomAt(v: View, centre: Point, scale: number): View {
  const img = toImage(centre, v)
  return { scale, x: centre.x - img.x * scale, y: centre.y - img.y * scale }
}

/**
 * Pincement à deux doigts : le point de l'image sous le milieu initial des doigts
 * suit leur milieu actuel, et l'échelle suit l'écartement.
 */
export function pinchView(start: View, a0: Point, b0: Point, a1: Point, b1: Point, min: number, max: number): View {
  const d0 = distance(a0, b0)
  const scale = clampScale(d0 > 0 ? (start.scale * distance(a1, b1)) / d0 : start.scale, min, max)
  const img = toImage(milieu(a0, b0), start)
  const m1 = milieu(a1, b1)
  return { scale, x: m1.x - img.x * scale, y: m1.y - img.y * scale }
}

export function clampToImage(p: Point, w: number, h: number): Point {
  return { x: Math.max(0, Math.min(w, p.x)), y: Math.max(0, Math.min(h, p.y)) }
}

/** Angle du texte le long d'une ligne, en degrés, toujours lisible (jamais à l'envers). */
export function angleLisible(a: Point, b: Point): number {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  if (deg > 90) deg -= 180
  if (deg <= -90) deg += 180
  return deg
}

/** Distance d'un point à une suite de segments (points à plat x1, y1, x2, y2…). */
export function distanceToPolyline(p: Point, points: number[]): number {
  if (points.length < 2) return Infinity
  let d = distance(p, { x: points[0], y: points[1] })
  for (let i = 2; i + 1 < points.length; i += 2) {
    d = Math.min(d, distanceToSegment(p, { x: points[i - 2], y: points[i - 1] }, { x: points[i], y: points[i + 1] }))
  }
  return d
}

/**
 * Aimantation sur un croquis : d'abord les bouts de traits et de cotes existants,
 * sinon le croisement du quadrillage le plus proche. Le rayon est en unités de feuille.
 */
export function aimanter(p: Point, cibles: Point[], pas: number, rayon: number): Point {
  let meilleur: Point | null = null
  let dMin = rayon
  for (const c of cibles) {
    const d = distance(p, c)
    if (d < dMin) {
      dMin = d
      meilleur = c
    }
  }
  if (meilleur) return meilleur
  const noeud = { x: Math.round(p.x / pas) * pas, y: Math.round(p.y / pas) * pas }
  return distance(p, noeud) < rayon ? noeud : p
}
