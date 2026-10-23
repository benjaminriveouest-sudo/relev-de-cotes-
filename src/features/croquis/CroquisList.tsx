import { useCallback, useEffect, useRef, useState } from 'react'
import { addCroquis, listCroquis, nouveauCroquis, type CroquisResume } from '../../db/db'
import { dessinerFeuille } from './feuille'

interface Props {
  ouvrageId: string
  onOpen: (croquisId: string) => void
}

export function CroquisList({ ouvrageId, onOpen }: Props) {
  const [croquis, setCroquis] = useState<CroquisResume[]>()
  const [erreur, setErreur] = useState<string>()

  const recharger = useCallback(() => {
    listCroquis(ouvrageId).then(setCroquis)
  }, [ouvrageId])
  useEffect(recharger, [recharger])

  async function creer() {
    const c = nouveauCroquis(ouvrageId)
    try {
      await addCroquis(c)
      onOpen(c.id)
    } catch (e) {
      setErreur(`Impossible de créer le croquis (${e instanceof Error ? e.message : e}).`)
    }
  }

  return (
    <>
      <div className="actions-principales actions-une">
        <button className="btn" onClick={creer}>
          ✏️ Nouveau croquis
        </button>
      </div>
      {erreur && <p className="info erreur">{erreur}</p>}

      <ul className="grille">
        {croquis?.map((r) => (
          <li key={r.croquis.id}>
            <Apercu resume={r} onClick={() => onOpen(r.croquis.id)} />
          </li>
        ))}
      </ul>
    </>
  )
}

const APERCU = { w: 300, h: 225 }

/** Aperçu cadré sur ce qui est dessiné (feuille entière si elle est vide). */
function Apercu({ resume, onClick }: { resume: CroquisResume; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { croquis, annotations } = resume
  const nbCotes = annotations.cotes.length

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const xs = [...annotations.traits.flatMap((t) => t.points.filter((_, i) => i % 2 === 0)), ...annotations.cotes.flatMap((c) => [c.a.x, c.b.x])]
    const ys = [...annotations.traits.flatMap((t) => t.points.filter((_, i) => i % 2 === 1)), ...annotations.cotes.flatMap((c) => [c.a.y, c.b.y])]
    const marge = croquis.pas * 2
    const boite = xs.length
      ? { x: Math.min(...xs) - marge, y: Math.min(...ys) - marge, w: Math.max(...xs) - Math.min(...xs) + 2 * marge, h: Math.max(...ys) - Math.min(...ys) + 2 * marge }
      : { x: 0, y: 0, w: croquis.largeur, h: croquis.hauteur }
    const echelle = Math.min(APERCU.w / boite.w, APERCU.h / boite.h)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, APERCU.w, APERCU.h)
    ctx.setTransform(echelle, 0, 0, echelle, APERCU.w / 2 - (boite.x + boite.w / 2) * echelle, APERCU.h / 2 - (boite.y + boite.h / 2) * echelle)
    // Épaisseurs comptées pour un aperçu affiché à la moitié de sa taille.
    dessinerFeuille(ctx, croquis, annotations.traits, echelle / 2)
    ctx.strokeStyle = '#e0a800'
    ctx.lineWidth = 4 / echelle
    ctx.beginPath()
    for (const c of annotations.cotes) {
      ctx.moveTo(c.a.x, c.a.y)
      ctx.lineTo(c.b.x, c.b.y)
    }
    ctx.stroke()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [croquis, annotations])

  return (
    <button className="miniature" onClick={onClick}>
      <canvas ref={ref} className="apercu-croquis" width={APERCU.w} height={APERCU.h} />
      <span className="miniature-legende">
        Croquis · {nbCotes} cote{nbCotes > 1 ? 's' : ''}
      </span>
    </button>
  )
}
