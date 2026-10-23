import { useEffect, useRef } from 'react'
import type { Point } from '../../models/types'
import { toImage, type View } from './geometry'

const TAILLE = 150
const GROSSISSEMENT = 3

interface Props {
  image: HTMLImageElement
  view: View
  /** Position du doigt à l'écran. */
  cible: Point
  /** Premier point déjà placé, en pixels image, pour voir la ligne en cours. */
  depart?: Point | null
  largeurCadre: number
}

/** Agrandit la zone sous le doigt pour viser précisément : le point se pose au centre de la croix. */
export function Loupe({ image, view, cible, depart, largeurCadre }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dpr = window.devicePixelRatio || 1

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const centre = toImage(cible, view)
    const echelle = view.scale * GROSSISSEMENT // pixels loupe par pixel image
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#222'
    ctx.fillRect(0, 0, TAILLE, TAILLE)
    ctx.save()
    ctx.translate(TAILLE / 2 - centre.x * echelle, TAILLE / 2 - centre.y * echelle)
    ctx.scale(echelle, echelle)
    ctx.drawImage(image, 0, 0)
    ctx.restore()

    if (depart) {
      ctx.beginPath()
      ctx.moveTo(TAILLE / 2 + (depart.x - centre.x) * echelle, TAILLE / 2 + (depart.y - centre.y) * echelle)
      ctx.lineTo(TAILLE / 2, TAILLE / 2)
      ctx.strokeStyle = '#FFD400'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Croix de visée, noire et blanche pour rester visible sur tout fond.
    for (const [couleur, epaisseur] of [['#000', 4], ['#fff', 2]] as const) {
      ctx.strokeStyle = couleur
      ctx.lineWidth = epaisseur
      ctx.beginPath()
      ctx.moveTo(TAILLE / 2, 10)
      ctx.lineTo(TAILLE / 2, TAILLE / 2 - 6)
      ctx.moveTo(TAILLE / 2, TAILLE / 2 + 6)
      ctx.lineTo(TAILLE / 2, TAILLE - 10)
      ctx.moveTo(10, TAILLE / 2)
      ctx.lineTo(TAILLE / 2 - 6, TAILLE / 2)
      ctx.moveTo(TAILLE / 2 + 6, TAILLE / 2)
      ctx.lineTo(TAILLE - 10, TAILLE / 2)
      ctx.stroke()
    }
  }, [image, view, cible, depart, dpr])

  // En haut à gauche, ou à droite si le doigt est dessous.
  const aGauche = !(cible.x < TAILLE + 40 && cible.y < TAILLE + 60)
  const style = { left: aGauche ? 12 : largeurCadre - TAILLE - 12, width: TAILLE, height: TAILLE }

  return <canvas ref={ref} className="loupe" style={style} width={TAILLE * dpr} height={TAILLE * dpr} />
}
