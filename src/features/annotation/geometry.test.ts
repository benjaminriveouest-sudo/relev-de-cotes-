import { describe, expect, it } from 'vitest'
import {
  aimanter,
  angleLisible,
  clampToImage,
  distanceToPolyline,
  distanceToSegment,
  fitView,
  pinchView,
  toImage,
  toScreen,
  zoomAt,
} from './geometry'

describe('geometry', () => {
  it('passe de l’image à l’écran et retour', () => {
    const v = { scale: 0.25, x: 10, y: -40 }
    const p = { x: 1234, y: 567 }
    const r = toImage(toScreen(p, v), v)
    expect(r.x).toBeCloseTo(p.x)
    expect(r.y).toBeCloseTo(p.y)
  })

  it('ajuste une photo paysage dans un écran portrait', () => {
    const v = fitView(2000, 1000, 400, 800, 0)
    expect(v.scale).toBeCloseTo(0.2)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(300)
  })

  it('zoome en gardant le point visé immobile', () => {
    const v = { scale: 0.5, x: 20, y: 30 }
    const c = { x: 200, y: 150 }
    const avant = toImage(c, v)
    const apres = toImage(c, zoomAt(v, c, 2))
    expect(apres.x).toBeCloseTo(avant.x)
    expect(apres.y).toBeCloseTo(avant.y)
  })

  it('pincement : écarter les doigts double le zoom autour de leur milieu', () => {
    const v = { scale: 1, x: 0, y: 0 }
    const r = pinchView(v, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 }, 0.1, 10)
    expect(r.scale).toBeCloseTo(2)
    expect(toImage({ x: 150, y: 100 }, r).x).toBeCloseTo(150)
  })

  it('pincement : le zoom reste dans ses limites', () => {
    const v = { scale: 1, x: 0, y: 0 }
    const r = pinchView(v, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 1000, y: 0 }, 0.1, 8)
    expect(r.scale).toBe(8)
  })

  it('distance à un segment', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3)
    expect(distanceToSegment({ x: 14, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5)
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5)
  })

  it('le texte d’une cote n’est jamais à l’envers', () => {
    expect(angleLisible({ x: 10, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(0)
    expect(angleLisible({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90)
    expect(angleLisible({ x: 0, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(90)
    expect(angleLisible({ x: 10, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(45)
  })

  it('garde les points dans la photo', () => {
    expect(clampToImage({ x: -5, y: 3000 }, 100, 200)).toEqual({ x: 0, y: 200 })
  })
})

describe('croquis', () => {
  it('mesure la distance à un tracé à plusieurs segments', () => {
    expect(distanceToPolyline({ x: 5, y: 3 }, [0, 0, 10, 0, 10, 10])).toBe(3)
    expect(distanceToPolyline({ x: 13, y: 5 }, [0, 0, 10, 0, 10, 10])).toBe(3)
    expect(distanceToPolyline({ x: 0, y: 0 }, [])).toBe(Infinity)
  })

  it('aimante d’abord sur un bout de trait, puis sur le quadrillage', () => {
    expect(aimanter({ x: 52, y: 49 }, [{ x: 58, y: 47 }], 50, 10)).toEqual({ x: 58, y: 47 })
    expect(aimanter({ x: 52, y: 49 }, [], 50, 10)).toEqual({ x: 50, y: 50 })
    expect(aimanter({ x: 75, y: 75 }, [], 50, 10)).toEqual({ x: 75, y: 75 })
  })
})
