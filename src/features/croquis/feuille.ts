import type { Croquis, Point, Trait } from '../../models/types'

export const COULEUR_TRAIT = '#000'
const COULEUR_TRAIT_SELECTION = '#0097b2'
const COULEUR_CARREAU = '#d3e3f0'
const COULEUR_GROS_CARREAU = '#93b7d4'
/** Un gros carreau tous les 5 petits, comme sur un bloc quadrillé. */
const GROS_CARREAU = 5

export type Feuille = Pick<Croquis, 'largeur' | 'hauteur' | 'pas'>

/**
 * Dessine la feuille quadrillée et ses traits, en unités de feuille.
 * `echelle` = pixels par unité : les épaisseurs restent constantes à l'écran quel que soit le zoom.
 */
export function dessinerFeuille(
  ctx: CanvasRenderingContext2D,
  f: Feuille,
  traits: Pick<Trait, 'id' | 'points'>[],
  echelle: number,
  selectionId?: string,
) {
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, f.largeur, f.hauteur)

  const lignes = (pas: number, couleur: string, epaisseur: number) => {
    ctx.beginPath()
    for (let x = pas; x < f.largeur; x += pas) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, f.hauteur)
    }
    for (let y = pas; y < f.hauteur; y += pas) {
      ctx.moveTo(0, y)
      ctx.lineTo(f.largeur, y)
    }
    ctx.strokeStyle = couleur
    ctx.lineWidth = epaisseur / echelle
    ctx.stroke()
  }
  // Petits carreaux masqués quand ils deviennent trop serrés pour être utiles.
  if (f.pas * echelle >= 5) lignes(f.pas, COULEUR_CARREAU, 1)
  lignes(f.pas * GROS_CARREAU, COULEUR_GROS_CARREAU, 1.5)
  ctx.strokeStyle = '#777'
  ctx.lineWidth = 2 / echelle
  ctx.strokeRect(0, 0, f.largeur, f.hauteur)

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const t of traits) {
    if (t.points.length < 4) continue
    ctx.beginPath()
    ctx.moveTo(t.points[0], t.points[1])
    for (let i = 2; i + 1 < t.points.length; i += 2) ctx.lineTo(t.points[i], t.points[i + 1])
    const selectionne = t.id === selectionId
    ctx.strokeStyle = selectionne ? COULEUR_TRAIT_SELECTION : COULEUR_TRAIT
    ctx.lineWidth = (selectionne ? 6 : 3) / echelle
    ctx.stroke()
  }
  ctx.restore()
}

/** Bouts des traits : points d'accroche pour enchaîner les lignes. */
export function boutsDesTraits(traits: Trait[]): Point[] {
  return traits.flatMap((t) =>
    t.points.length < 4
      ? []
      : [
          { x: t.points[0], y: t.points[1] },
          { x: t.points[t.points.length - 2], y: t.points[t.points.length - 1] },
        ],
  )
}
