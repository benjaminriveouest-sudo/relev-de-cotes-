import type { MurPiece } from '../../models/types'
import { contourMurs, TOLERANCE_FERMETURE_MM } from './forme'

const L = 400
const H = 300
const MARGE = 34

/** Dessin de la pièce pendant la saisie mur par mur : murs numérotés, et en rouge ce qui manque pour la refermer. */
export function CroquisPiece({ murs }: { murs: MurPiece[] }) {
  // Seuls les premiers murs déjà cotés sont dessinés : le croquis avance avec la saisie.
  const cotes: MurPiece[] = []
  for (const m of murs) {
    if (!(m.longueurMm && m.longueurMm > 0)) break
    cotes.push(m)
  }
  const contour = contourMurs(cotes)
  if (!contour) {
    return (
      <svg className="croquis-piece" viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Croquis de la pièce">
        <text x={L / 2} y={H / 2}>
          Le croquis apparaît dès le premier mur
        </text>
      </svg>
    )
  }
  const tous = [...contour.points, contour.fin]
  const xs = tous.map((p) => p.x)
  const ys = tous.map((p) => p.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const dx = Math.max(Math.max(...xs) - x0, 1)
  const dy = Math.max(Math.max(...ys) - y0, 1)
  const k = Math.min((L - 2 * MARGE) / dx, (H - 2 * MARGE) / dy)
  const ox = (L - dx * k) / 2
  const oy = (H - dy * k) / 2
  // L'axe Y du relevé monte, celui de l'écran descend.
  const ecran = (p: { x: number; y: number }) => ({ x: ox + (p.x - x0) * k, y: H - oy - (p.y - y0) * k })
  const pts = tous.map(ecran)
  const complet = cotes.length === murs.length && cotes.length >= 3
  const ferme = complet && contour.ecartMm <= TOLERANCE_FERMETURE_MM
  const trace = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  // Centre du dessin : les numéros de mur sont écartés vers l'extérieur.
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length

  return (
    <svg className="croquis-piece" viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Croquis de la pièce">
      {ferme ? <polygon className="mur-trait" points={trace} /> : <polyline className="mur-trait" points={trace} />}
      {!ferme && complet && (
        <line className="ecart" x1={pts[pts.length - 1].x} y1={pts[pts.length - 1].y} x2={pts[0].x} y2={pts[0].y} />
      )}
      {cotes.map((_, i) => {
        const a = pts[i]
        const b = pts[i + 1]
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const d = Math.hypot(mx - cx, my - cy) || 1
        return (
          <text key={i} x={mx + ((mx - cx) / d) * 16} y={my + ((my - cy) / d) * 16}>
            {i + 1}
          </text>
        )
      })}
      <circle cx={pts[0].x} cy={pts[0].y} r={5} fill="var(--selection)" />
    </svg>
  )
}
