import { useEffect, useMemo, useRef, useState } from 'react'
import { Image as KonvaImage, Layer, Stage } from 'react-konva'
import { deletePhoto, getPhoto, loadAnnotations, saveAnnotations } from '../../db/db'
import { newId } from '../../models/id'
import type { Annotations, Cote, Photo, Point } from '../../models/types'
import { useObjectUrl } from '../../ui/useObjectUrl'
import {
  clampToImage,
  distance,
  distanceToSegment,
  fitView,
  pinchView,
  toImage,
  toScreen,
  zoomAt,
  clampScale,
  type View,
} from './geometry'
import { commit, createHistory, redo, undo, type History } from './history'
import { Loupe } from './Loupe'
import { PaveNumerique } from './PaveNumerique'
import { RepereDialog } from './RepereDialog'
import { CoteShape, LigneProvisoire, PointProvisoire, Poignee, RepereShape, texteCote } from './shapes'

type Mode = 'selection' | 'cote' | 'repere'
type Selection = { type: 'cote' | 'repere'; id: string } | null

type Geste =
  | { type: 'aucun' }
  | { type: 'placer' }
  | { type: 'poignee'; coteId: string; bout: 'a' | 'b'; bouge: boolean }
  | { type: 'repere'; repereId: string; bouge: boolean }
  | { type: 'pan'; depart: Point; vueDepart: View; bouge: boolean; touche: Selection }
  | { type: 'pincer'; ids: [number, number]; depart: [Point, Point]; vueDepart: View }

/** Zone de toucher autour d'une ligne ou d'une poignée, en pixels écran (doigt, voire gant). */
const RAYON_TOUCHER = 28
const SEUIL_MOUVEMENT = 8
const ZOOM_MAX = 8 // 1 pixel image = 8 pixels écran

type Dialogue =
  | { type: 'valeur'; cote: Cote; nouvelle: boolean }
  | { type: 'repere'; position: Point; repereId: string | null; texte: string }
  | null

interface Props {
  photoId: string
  onRetour: () => void
}

export function Editor({ photoId, onRetour }: Props) {
  const [photo, setPhoto] = useState<Photo | null>()
  const [historique, setHistorique] = useState<History<Annotations>>()

  useEffect(() => {
    let annule = false
    Promise.all([getPhoto(photoId), loadAnnotations(photoId)]).then(([p, ann]) => {
      if (annule) return
      setPhoto(p ?? null)
      setHistorique(createHistory(ann))
    })
    return () => {
      annule = true
    }
  }, [photoId])

  if (photo === null) {
    return (
      <div className="ecran">
        <p className="info">Cette photo n'existe plus.</p>
        <button className="btn" onClick={onRetour}>
          ← Photos
        </button>
      </div>
    )
  }
  if (!photo || !historique) return <div className="ecran" />

  return <EditorCharge photo={photo} historique={historique} setHistorique={setHistorique} onRetour={onRetour} />
}

interface EditorChargeProps {
  photo: Photo
  historique: History<Annotations>
  setHistorique: (h: History<Annotations>) => void
  onRetour: () => void
}

function EditorCharge({ photo, historique, setHistorique, onRetour }: EditorChargeProps) {
  const url = useObjectUrl(photo.blob)
  const image = useImage(url)
  const cadreRef = useRef<HTMLDivElement>(null)
  const taille = useTaille(cadreRef)

  const [mode, setMode] = useState<Mode>('cote')
  const [selection, setSelection] = useState<Selection>(null)
  const [view, setView] = useState<View>()
  const [vise, setVise] = useState<Point | null>(null) // doigt à l'écran, pour la loupe
  const [pointA, setPointA] = useState<Point | null>(null) // premier point de la cote en cours
  const [brouillon, setBrouillon] = useState<Annotations | null>(null) // pendant un glisser
  const [dialogue, setDialogue] = useState<Dialogue>(null)
  const [erreur, setErreur] = useState<string>()

  const pointeurs = useRef(new Map<number, Point>())
  const geste = useRef<Geste>({ type: 'aucun' })

  const ann = brouillon ?? historique.present

  // Sauvegarde automatique à chaque changement validé.
  const premierRendu = useRef(true)
  useEffect(() => {
    if (premierRendu.current) {
      premierRendu.current = false
      return
    }
    saveAnnotations(photo.id, historique.present).catch((e) =>
      setErreur(`Sauvegarde impossible : ${e instanceof Error ? e.message : e}`),
    )
  }, [photo.id, historique.present])

  const vueAjustee = useMemo(
    () => (taille ? fitView(photo.width, photo.height, taille.w, taille.h) : undefined),
    [photo.width, photo.height, taille],
  )
  useEffect(() => {
    if (vueAjustee) setView(vueAjustee)
  }, [vueAjustee])

  const zoomMin = (vueAjustee?.scale ?? 1) * 0.5

  function valider(next: Annotations) {
    setHistorique(commit(historique, next))
  }

  function changerMode(m: Mode) {
    setMode(m)
    setPointA(null)
    setSelection(null)
  }

  function positionLocale(e: React.PointerEvent): Point {
    const r = cadreRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function versImage(p: Point, v: View): Point {
    return clampToImage(toImage(p, v), photo.width, photo.height)
  }

  function toucher(p: Point, v: View): Selection {
    for (const r of [...ann.reperes].reverse()) {
      const s = toScreen(r.position, v)
      // Le repère est dessiné au-dessus de son point.
      if (Math.abs(p.x - s.x) < 60 && p.y < s.y + 10 && p.y > s.y - 50) return { type: 'repere', id: r.id }
    }
    let meilleure: Selection = null
    let dMin = RAYON_TOUCHER
    for (const c of ann.cotes) {
      const d = distanceToSegment(p, toScreen(c.a, v), toScreen(c.b, v))
      if (d < dMin) {
        dMin = d
        meilleure = { type: 'cote', id: c.id }
      }
    }
    return meilleure
  }

  function annulerGeste() {
    setBrouillon(null)
    setVise(null)
    geste.current = { type: 'aucun' }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!view || dialogue) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = positionLocale(e)
    pointeurs.current.set(e.pointerId, p)

    if (pointeurs.current.size === 2) {
      // Deuxième doigt : on abandonne le geste en cours et on zoome.
      annulerGeste()
      const [[id1, p1], [id2, p2]] = [...pointeurs.current.entries()]
      geste.current = { type: 'pincer', ids: [id1, id2], depart: [p1, p2], vueDepart: view }
      return
    }
    if (pointeurs.current.size > 2) return

    if (mode === 'cote' || mode === 'repere') {
      geste.current = { type: 'placer' }
      setVise(p)
      return
    }

    // Mode sélection : poignées de la cote sélectionnée d'abord.
    if (selection?.type === 'cote') {
      const c = ann.cotes.find((x) => x.id === selection.id)
      if (c) {
        for (const bout of ['a', 'b'] as const) {
          if (distance(p, toScreen(c[bout], view)) < RAYON_TOUCHER) {
            geste.current = { type: 'poignee', coteId: c.id, bout, bouge: false }
            setVise(p)
            return
          }
        }
      }
    }
    const touche = toucher(p, view)
    if (touche?.type === 'repere' && selection?.type === 'repere' && selection.id === touche.id) {
      geste.current = { type: 'repere', repereId: touche.id, bouge: false }
      return
    }
    geste.current = { type: 'pan', depart: p, vueDepart: view, bouge: false, touche }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointeurs.current.has(e.pointerId) || !view) return
    const p = positionLocale(e)
    pointeurs.current.set(e.pointerId, p)
    const g = geste.current

    switch (g.type) {
      case 'pincer': {
        const a = pointeurs.current.get(g.ids[0])
        const b = pointeurs.current.get(g.ids[1])
        if (a && b) setView(pinchView(g.vueDepart, g.depart[0], g.depart[1], a, b, zoomMin, ZOOM_MAX))
        break
      }
      case 'placer':
        setVise(p)
        break
      case 'poignee': {
        g.bouge = true
        const pt = versImage(p, view)
        const base = brouillon ?? historique.present
        setBrouillon({
          ...base,
          cotes: base.cotes.map((c) => (c.id === g.coteId ? { ...c, [g.bout]: pt, updatedAt: Date.now() } : c)),
        })
        setVise(p)
        break
      }
      case 'repere': {
        g.bouge = true
        const pt = versImage(p, view)
        const base = brouillon ?? historique.present
        setBrouillon({
          ...base,
          reperes: base.reperes.map((r) => (r.id === g.repereId ? { ...r, position: pt, updatedAt: Date.now() } : r)),
        })
        break
      }
      case 'pan':
        if (!g.bouge && distance(p, g.depart) > SEUIL_MOUVEMENT) g.bouge = true
        if (g.bouge) setView({ ...g.vueDepart, x: g.vueDepart.x + p.x - g.depart.x, y: g.vueDepart.y + p.y - g.depart.y })
        break
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointeurs.current.has(e.pointerId)) return
    const p = positionLocale(e)
    pointeurs.current.delete(e.pointerId)
    const g = geste.current
    geste.current = { type: 'aucun' }
    setVise(null)
    if (!view || e.type === 'pointercancel') {
      setBrouillon(null)
      return
    }

    switch (g.type) {
      case 'placer': {
        const pt = versImage(p, view)
        if (mode === 'repere') {
          setDialogue({ type: 'repere', position: pt, repereId: null, texte: '' })
        } else if (!pointA) {
          setPointA(pt)
        } else if (distance(toScreen(pointA, view), p) > SEUIL_MOUVEMENT) {
          const cote: Cote = { id: newId(), photoId: photo.id, a: pointA, b: pt, valeurMm: null, libelle: '', updatedAt: Date.now() }
          setPointA(null)
          setDialogue({ type: 'valeur', cote, nouvelle: true })
        }
        break
      }
      case 'poignee':
      case 'repere':
        if (g.bouge && brouillon) valider(brouillon)
        setBrouillon(null)
        break
      case 'pan':
        if (!g.bouge) setSelection(g.touche)
        break
    }
  }

  function onWheel(e: React.WheelEvent) {
    if (!view) return
    const r = cadreRef.current!.getBoundingClientRect()
    const scale = clampScale(view.scale * Math.exp(-e.deltaY * 0.0015), zoomMin, ZOOM_MAX)
    setView(zoomAt(view, { x: e.clientX - r.left, y: e.clientY - r.top }, scale))
  }

  const coteSelectionnee = selection?.type === 'cote' ? ann.cotes.find((c) => c.id === selection.id) : undefined
  const repereSelectionne = selection?.type === 'repere' ? ann.reperes.find((r) => r.id === selection.id) : undefined

  function supprimerSelection() {
    if (!selection) return
    valider({
      cotes: ann.cotes.filter((c) => c.id !== selection.id),
      reperes: ann.reperes.filter((r) => r.id !== selection.id),
    })
    setSelection(null)
  }

  async function supprimerPhoto() {
    if (!window.confirm('Supprimer cette photo et toutes ses cotes ?')) return
    await deletePhoto(photo.id)
    onRetour()
  }

  const nbSansValeur = ann.cotes.filter((c) => c.valeurMm === null).length
  const consigne =
    mode === 'cote'
      ? pointA
        ? 'Touchez le second point'
        : 'Touchez le premier point de la cote'
      : mode === 'repere'
        ? "Touchez l'endroit du repère"
        : selection
          ? 'Glissez les ronds pour ajuster'
          : 'Touchez une cote pour la modifier'

  return (
    <div className="ecran editeur">
      <header className="barre">
        <button className="btn btn-icone" onClick={onRetour} aria-label="Retour aux photos">
          ←
        </button>
        <span className="barre-titre">
          {ann.cotes.length} cote{ann.cotes.length > 1 ? 's' : ''}
          {nbSansValeur > 0 && <span className="alerte"> · {nbSansValeur} sans valeur</span>}
        </span>
        <button className="btn btn-icone" onClick={() => vueAjustee && setView(vueAjustee)} aria-label="Voir toute la photo">
          ⤢
        </button>
        <button className="btn btn-icone" onClick={supprimerPhoto} aria-label="Supprimer la photo">
          🗑
        </button>
      </header>

      <div
        ref={cadreRef}
        className="cadre"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {taille && view && image && (
          <Stage width={taille.w} height={taille.h} listening={false}>
            <Layer listening={false}>
              <KonvaImage image={image} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} />
            </Layer>
            <Layer listening={false}>
              {ann.cotes.map((c) => (
                <CoteShape
                  key={c.id}
                  a={toScreen(c.a, view)}
                  b={toScreen(c.b, view)}
                  texte={texteCote(c.valeurMm, c.libelle)}
                  manquante={c.valeurMm === null}
                  selectionnee={c.id === coteSelectionnee?.id}
                />
              ))}
              {dialogue?.type === 'valeur' && dialogue.nouvelle && (
                <CoteShape a={toScreen(dialogue.cote.a, view)} b={toScreen(dialogue.cote.b, view)} texte="… mm" manquante selectionnee />
              )}
              {ann.reperes.map((r) => (
                <RepereShape key={r.id} p={toScreen(r.position, view)} texte={r.texte} selectionne={r.id === repereSelectionne?.id} />
              ))}
              {coteSelectionnee && (
                <>
                  <Poignee p={toScreen(coteSelectionnee.a, view)} />
                  <Poignee p={toScreen(coteSelectionnee.b, view)} />
                </>
              )}
              {pointA && vise && <LigneProvisoire a={toScreen(pointA, view)} b={toScreen(versImage(vise, view), view)} />}
              {pointA && <PointProvisoire p={toScreen(pointA, view)} />}
            </Layer>
          </Stage>
        )}
        {vise && view && image && taille && (
          <Loupe image={image} view={view} cible={vise} depart={mode === 'cote' ? pointA : null} largeurCadre={taille.w} />
        )}
        <div className="consigne">{erreur ?? consigne}</div>
      </div>

      <footer className="outils">
        {selection ? (
          <div className="outils-ligne">
            {coteSelectionnee && (
              <button className="btn btn-primaire" onClick={() => setDialogue({ type: 'valeur', cote: coteSelectionnee, nouvelle: false })}>
                ✎ Valeur
              </button>
            )}
            {repereSelectionne && (
              <button
                className="btn btn-primaire"
                onClick={() =>
                  setDialogue({ type: 'repere', position: repereSelectionne.position, repereId: repereSelectionne.id, texte: repereSelectionne.texte })
                }
              >
                ✎ Texte
              </button>
            )}
            <button className="btn btn-danger" onClick={supprimerSelection}>
              Supprimer
            </button>
            <button className="btn" onClick={() => setSelection(null)}>
              OK
            </button>
          </div>
        ) : (
          <div className="outils-ligne">
            <button className={`btn ${mode === 'cote' ? 'actif' : ''}`} onClick={() => changerMode('cote')}>
              ↔ Cote
            </button>
            <button className={`btn ${mode === 'repere' ? 'actif' : ''}`} onClick={() => changerMode('repere')}>
              T Repère
            </button>
            <button className={`btn ${mode === 'selection' ? 'actif' : ''}`} onClick={() => changerMode('selection')}>
              ☝ Modifier
            </button>
          </div>
        )}
        <div className="outils-ligne">
          {pointA ? (
            <button className="btn" onClick={() => setPointA(null)}>
              Annuler le point
            </button>
          ) : (
            <>
              <button className="btn btn-icone" disabled={historique.past.length === 0} onClick={() => { setSelection(null); setHistorique(undo(historique)) }} aria-label="Annuler">
                ↶
              </button>
              <button className="btn btn-icone" disabled={historique.future.length === 0} onClick={() => { setSelection(null); setHistorique(redo(historique)) }} aria-label="Rétablir">
                ↷
              </button>
            </>
          )}
        </div>
      </footer>

      {dialogue?.type === 'valeur' && (
        <PaveNumerique
          valeurInitiale={dialogue.cote.valeurMm}
          libelleInitial={dialogue.cote.libelle}
          onAnnuler={() => setDialogue(null)}
          onValider={(valeurMm, libelle) => {
            const cote = { ...dialogue.cote, valeurMm, libelle, updatedAt: Date.now() }
            valider({
              ...ann,
              cotes: dialogue.nouvelle ? [...ann.cotes, cote] : ann.cotes.map((c) => (c.id === cote.id ? cote : c)),
            })
            setDialogue(null)
          }}
        />
      )}
      {dialogue?.type === 'repere' && (
        <RepereDialog
          texteInitial={dialogue.texte}
          onAnnuler={() => setDialogue(null)}
          onValider={(texte) => {
            const id = dialogue.repereId
            valider({
              ...ann,
              reperes: id
                ? ann.reperes.map((r) => (r.id === id ? { ...r, texte, updatedAt: Date.now() } : r))
                : [...ann.reperes, { id: newId(), photoId: photo.id, position: dialogue.position, texte, updatedAt: Date.now() }],
            })
            setDialogue(null)
          }}
        />
      )}
    </div>
  )
}

function useImage(url: string | undefined): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement>()
  useEffect(() => {
    if (!url) return
    const img = new window.Image()
    img.onload = () => setImage(img)
    img.src = url
  }, [url])
  return image
}

function useTaille(ref: React.RefObject<HTMLDivElement | null>) {
  const [taille, setTaille] = useState<{ w: number; h: number }>()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setTaille((t) => (t && t.w === width && t.h === height ? t : { w: width, h: height }))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref])
  return taille
}
