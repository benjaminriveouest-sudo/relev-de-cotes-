import { Arrow, Circle, Group, Label, Line, Tag, Text } from 'react-konva'
import type { Point } from '../../models/types'
import { angleLisible, arcAngle, milieu } from './geometry'

export const COULEUR = '#FFD400'
export const COULEUR_SELECTION = '#00E5FF'
export const COULEUR_MANQUANTE = '#FF5A36'
const TAILLE_TEXTE = 20
/** Rayon de l'arc d'un angle et écart de son texte, pour une taille de texte de 20. */
export const RAYON_ARC = 56
export const ECART_TEXTE_ARC = 30

let ctxMesure: CanvasRenderingContext2D | null = null
function largeurTexte(texte: string): number {
  ctxMesure ??= document.createElement('canvas').getContext('2d')
  if (!ctxMesure) return texte.length * TAILLE_TEXTE * 0.6
  ctxMesure.font = `bold ${TAILLE_TEXTE}px sans-serif`
  return ctxMesure.measureText(texte).width
}

export function texteCote(valeurMm: number | null, libelle: string): string {
  const valeur = valeurMm === null ? '? mm' : `${valeurMm} mm`
  return libelle ? `${libelle} ${valeur}` : valeur
}

export function texteAngle(valeur: number | null, libelle: string): string {
  const texte = valeur === null ? '?°' : `${String(valeur).replace('.', ',')}°`
  return libelle ? `${libelle} ${texte}` : texte
}

interface CoteProps {
  a: Point
  b: Point
  texte: string
  manquante: boolean
  selectionnee: boolean
}

/** Cote en coordonnées écran : épaisseurs et texte constants quel que soit le zoom. */
export function CoteShape({ a, b, texte, manquante, selectionnee }: CoteProps) {
  const couleur = selectionnee ? COULEUR_SELECTION : COULEUR
  const m = milieu(a, b)
  const padding = 4
  const w = largeurTexte(texte) + 2 * padding
  const h = TAILLE_TEXTE + 2 * padding
  const points = [a.x, a.y, b.x, b.y]
  return (
    <Group listening={false}>
      <Arrow points={points} pointerAtBeginning pointerLength={16} pointerWidth={16} stroke="#000" fill="#000" strokeWidth={7} />
      <Arrow points={points} pointerAtBeginning pointerLength={13} pointerWidth={11} stroke={couleur} fill={couleur} strokeWidth={3} />
      <Label x={m.x} y={m.y} rotation={angleLisible(a, b)} offsetX={w / 2} offsetY={h / 2}>
        <Tag fill="#000" cornerRadius={4} stroke={couleur} strokeWidth={selectionnee ? 2 : 0} />
        <Text text={texte} fontSize={TAILLE_TEXTE} fontStyle="bold" fill={manquante ? COULEUR_MANQUANTE : couleur} padding={padding} />
      </Label>
    </Group>
  )
}

interface AngleProps extends CoteProps {
  sommet: Point
  valeur: number | null
}

/** Cote d'angle en coordonnées écran : deux branches depuis le sommet et un arc. */
export function AngleShape({ sommet, a, b, valeur, texte, manquante, selectionnee }: AngleProps) {
  const couleur = selectionnee ? COULEUR_SELECTION : COULEUR
  const arc = arcAngle(sommet, a, b, RAYON_ARC, ECART_TEXTE_ARC, valeur)
  const padding = 4
  const w = largeurTexte(texte) + 2 * padding
  const h = TAILLE_TEXTE + 2 * padding
  const branches = [a.x, a.y, sommet.x, sommet.y, b.x, b.y]
  return (
    <Group listening={false}>
      <Line points={branches} stroke="#000" strokeWidth={7} lineJoin="round" />
      <Line points={arc.points} stroke="#000" strokeWidth={7} />
      <Line points={branches} stroke={couleur} strokeWidth={3} lineJoin="round" />
      <Line points={arc.points} stroke={couleur} strokeWidth={3} />
      <Label x={arc.texte.x} y={arc.texte.y} offsetX={w / 2} offsetY={h / 2}>
        <Tag fill="#000" cornerRadius={4} stroke={couleur} strokeWidth={selectionnee ? 2 : 0} />
        <Text text={texte} fontSize={TAILLE_TEXTE} fontStyle="bold" fill={manquante ? COULEUR_MANQUANTE : couleur} padding={padding} />
      </Label>
    </Group>
  )
}

export function Poignee({ p }: { p: Point }) {
  return <Circle x={p.x} y={p.y} radius={14} stroke={COULEUR_SELECTION} strokeWidth={3} fill="rgba(0,229,255,0.25)" listening={false} />
}

export function PointProvisoire({ p }: { p: Point }) {
  return (
    <Group listening={false}>
      <Circle x={p.x} y={p.y} radius={7} fill={COULEUR} stroke="#000" strokeWidth={2} />
    </Group>
  )
}

export function LigneProvisoire({ a, b }: { a: Point; b: Point }) {
  return (
    <Group listening={false}>
      <Line points={[a.x, a.y, b.x, b.y]} stroke="#000" strokeWidth={6} dash={[12, 8]} />
      <Line points={[a.x, a.y, b.x, b.y]} stroke={COULEUR} strokeWidth={3} dash={[12, 8]} />
    </Group>
  )
}

export function RepereShape({ p, texte, selectionne }: { p: Point; texte: string; selectionne: boolean }) {
  return (
    <Label x={p.x} y={p.y} listening={false}>
      <Tag
        fill={selectionne ? COULEUR_SELECTION : '#fff'}
        stroke="#000"
        strokeWidth={2}
        cornerRadius={4}
        pointerDirection="down"
        pointerWidth={14}
        pointerHeight={12}
      />
      <Text text={texte} fontSize={18} fontStyle="bold" fill="#000" padding={6} />
    </Label>
  )
}
