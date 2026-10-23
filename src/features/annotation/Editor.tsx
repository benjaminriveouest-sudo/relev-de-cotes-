import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Image as KonvaImage, Layer, Shape, Stage } from 'react-konva'
import { deletePhoto, getPhoto, loadAnnotations, saveAnnotations } from '../../db/db'
import { newId } from '../../models/id'
import type { Annotations, Cote, Photo, Point, Trait } from '../../models/types'
import { useObjectUrl } from '../../ui/useObjectUrl'
import { boutsDesTraits, dessinerFeuille, type Feuille } from '../croquis/feuille'
import {
  aimanter,
  clampToImage,
  distance,
  distanceToPolyline,
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

type Mode = 'selection' | 'cote' | 'repere' | 'libre' | 'droite'
type Selection = { type: 'cote' | 'repere' | 'trait'; id: string } | null

type Geste =
  | { type: 'aucun' }
  | { type: 'placer' }
  | { type: 'libre' }
  | { type: 'droite'; a: Point }
  | { type: 'poignee'; coteId: string; bout: 'a' | 'b'; bouge: boolean }
  | { type: 'repere'; repereId: string; bouge: boolean }
  | { type: 'pan'; depart: Point; vueDepart: View; bouge: boolean; touche: Selection }
  | { type: 'pincer'; ids: [number, number]; depart: [Point, Point]; vueDepart: View }

/** Zone de toucher autour d'une ligne ou d'une poignée, en pixels écran (doigt, voire gant). */
const RAYON_TOUCHER = 28
/** Distance d'aimantation sur un croquis, en pixels écran. */
const RAYON_AIMANT = 18
/** Écart minimal entre deux points d'un tracé à main levée, en pixels écran. */
const PAS_TRACE = 3
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

  return <EditeurPhoto photo={photo} historique={historique} setHistorique={setHistorique} onRetour={onRetour} />
}

interface EditeurPhotoProps {
  photo: Photo
  historique: History<Annotations>
  setHistorique: (h: History<Annotations>) => void
  onRetour: () => void
}

function EditeurPhoto({ photo, ...props }: EditeurPhotoProps) {
  const url = useObjectUrl(photo.blob)
  const image = useImage(url)
  return (
    <EditeurCalque
      {...props}
      supportId={photo.id}
      largeur={photo.width}
      hauteur={photo.height}
      image={image}
      questionSuppression="Supprimer cette photo et toutes ses cotes ?"
      supprimer={() => deletePhoto(photo.id)}
    />
  )
}

interface EditeurCalqueProps {
  /** Photo ou croquis annoté. */
  supportId: string
  largeur: number
  hauteur: number
  /** Fond d'une photo (pas encore chargé : undefined). */
  image?: HTMLImageElement
  /** Fond d'un croquis : feuille quadrillée, avec les outils de tracé en plus. */
  feuille?: Feuille
  historique: History<Annotations>
  setHistorique: (h: History<Annotations>) => void
  onRetour: () => void
  questionSuppression: string
  supprimer: () => Promise<void>
}

/** Éditeur de cotes et repères, commun aux photos et aux croquis. */
export function EditeurCalque({
  supportId,
  largeur,
  hauteur,
  image,
  feuille,
  historique,
  setHistorique,
  onRetour,
  questionSuppression,
  supprimer,
}: EditeurCalqueProps) {
  const cadreRef = useRef<HTMLDivElement>(null)
  const taille = useTaille(cadreRef)

  const [mode, setMode] = useState<Mode>(feuille ? 'droite' : 'cote')
  const [selection, setSelection] = useState<Selection>(null)
  const [view, setView] = useState<View>()
  const [vise, setVise] = useState<Point | null>(null) // doigt à l'écran, pour la loupe
  const [pointA, setPointA] = useState<Point | null>(null) // premier point de la cote en cours
  const [brouillon, setBrouillon] = useState<Annotations | null>(null) // pendant un glisser
  const [dialogue, setDialogue] = useState<Dialogue>(null)
  const [erreur, setErreur] = useState<string>()
  const [trace, setTrace] = useState<number[] | null>(null) // trait en cours (unités image)

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
    saveAnnotations(supportId, historique.present).catch((e) =>
      setErreur(`Sauvegarde impossible : ${e instanceof Error ? e.message : e}`),
    )
  }, [supportId, historique.present])

  const vueAjustee = useMemo(
    () => (taille ? fitView(largeur, hauteur, taille.w, taille.h) : undefined),
    [largeur, hauteur, taille],
  )
  useEffect(() => {
    if (vueAjustee) setView(vueAjustee)
  }, [vueAjustee])

  const zoomMin = (vueAjustee?.scale ?? 1) * 0.5

  function valider(next: Annotations) {
    setHistorique(commit(historique, next))
  }

  // Le trait en cours s'affiche avec les autres, pour le voir aussi dans la loupe.
  const traits: Pick<Trait, 'id' | 'points'>[] = useMemo(
    () => (trace ? [...ann.traits, { id: 'en-cours', points: trace }] : ann.traits),
    [ann.traits, trace],
  )
  const traitSelectionneId = selection?.type === 'trait' ? selection.id : undefined
  const dessinerFond = useCallback(
    (ctx: CanvasRenderingContext2D, echelle: number) => {
      if (feuille) dessinerFeuille(ctx, feuille, traits, echelle, traitSelectionneId)
      else if (image) ctx.drawImage(image, 0, 0)
    },
    [feuille, image, traits, traitSelectionneId],
  )
  const fondPret = !!feuille || !!image

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
    return clampToImage(toImage(p, v), largeur, hauteur)
  }

  /** Point visé : sur un croquis, il s'accroche aux bouts de traits et de cotes, ou au quadrillage. */
  function viser(p: Point, v: View, sauf?: string): Point {
    const pt = versImage(p, v)
    if (!feuille) return pt
    const cibles = [
      ...boutsDesTraits(ann.traits),
      ...ann.cotes.filter((c) => c.id !== sauf).flatMap((c) => [c.a, c.b]),
    ]
    return aimanter(pt, cibles, feuille.pas, RAYON_AIMANT / v.scale)
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
    if (meilleure) return meilleure
    const pt = toImage(p, v)
    for (const t of [...ann.traits].reverse()) {
      if (distanceToPolyline(pt, t.points) * v.scale < RAYON_TOUCHER) return { type: 'trait', id: t.id }
    }
    return null
  }

  function annulerGeste() {
    setBrouillon(null)
    setTrace(null)
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
    if (mode === 'libre') {
      const pt = versImage(p, view)
      geste.current = { type: 'libre' }
      setTrace([pt.x, pt.y])
      return
    }
    if (mode === 'droite') {
      const a = viser(p, view)
      geste.current = { type: 'droite', a }
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
      case 'libre': {
        const pt = versImage(p, view)
        setTrace((t) => {
          if (!t) return t
          const dernier = { x: t[t.length - 2], y: t[t.length - 1] }
          return distance(toScreen(dernier, view), toScreen(pt, view)) < PAS_TRACE ? t : [...t, pt.x, pt.y]
        })
        break
      }
      case 'droite': {
        const b = viser(p, view)
        setTrace([g.a.x, g.a.y, b.x, b.y])
        setVise(p)
        break
      }
      case 'poignee': {
        g.bouge = true
        const pt = viser(p, view, g.coteId)
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
    const traceFini = trace
    setTrace(null)
    if (!view || e.type === 'pointercancel') {
      setBrouillon(null)
      return
    }

    switch (g.type) {
      case 'libre':
        if (traceFini && traceFini.length >= 4) ajouterTrait(traceFini)
        break
      case 'droite': {
        const b = viser(p, view)
        if (distance(toScreen(g.a, view), toScreen(b, view)) > SEUIL_MOUVEMENT) ajouterTrait([g.a.x, g.a.y, b.x, b.y])
        break
      }
      case 'placer': {
        const pt = mode === 'cote' ? viser(p, view) : versImage(p, view)
        if (mode === 'repere') {
          setDialogue({ type: 'repere', position: pt, repereId: null, texte: '' })
        } else if (!pointA) {
          setPointA(pt)
        } else if (distance(toScreen(pointA, view), p) > SEUIL_MOUVEMENT) {
          const cote: Cote = { id: newId(), photoId: supportId, a: pointA, b: pt, valeurMm: null, libelle: '', updatedAt: Date.now() }
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

  function ajouterTrait(points: number[]) {
    valider({ ...ann, traits: [...ann.traits, { id: newId(), croquisId: supportId, points, updatedAt: Date.now() }] })
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
      traits: ann.traits.filter((t) => t.id !== selection.id),
    })
    setSelection(null)
  }

  async function supprimerSupport() {
    if (!window.confirm(questionSuppression)) return
    await supprimer()
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
        : mode === 'libre'
          ? 'Dessinez au doigt · 2 doigts pour déplacer'
          : mode === 'droite'
            ? 'Glissez du début à la fin du trait'
            : selection?.type === 'trait'
              ? 'Trait sélectionné'
              : selection
          ? 'Glissez les ronds pour ajuster'
          : 'Touchez une cote pour la modifier'

  return (
    <div className="ecran editeur">
      <header className="barre">
        <button className="btn btn-icone" onClick={onRetour} aria-label="Retour à l'ouvrage">
          ←
        </button>
        <span className="barre-titre">
          {ann.cotes.length} cote{ann.cotes.length > 1 ? 's' : ''}
          {nbSansValeur > 0 && <span className="alerte"> · {nbSansValeur} sans valeur</span>}
        </span>
        <button className="btn btn-icone" onClick={() => vueAjustee && setView(vueAjustee)} aria-label="Tout voir">
          ⤢
        </button>
        <button className="btn btn-icone" onClick={supprimerSupport} aria-label={feuille ? 'Supprimer le croquis' : 'Supprimer la photo'}>
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
        {taille && view && fondPret && (
          <Stage width={taille.w} height={taille.h} listening={false}>
            <Layer listening={false}>
              {image && <KonvaImage image={image} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} />}
              {feuille && (
                <Shape
                  listening={false}
                  perfectDrawEnabled={false}
                  sceneFunc={(ctx) => {
                    const c = ctx._context
                    c.save()
                    c.translate(view.x, view.y)
                    c.scale(view.scale, view.scale)
                    dessinerFond(c, view.scale)
                    c.restore()
                  }}
                />
              )}
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
              {pointA && vise && <LigneProvisoire a={toScreen(pointA, view)} b={toScreen(viser(vise, view), view)} />}
              {pointA && <PointProvisoire p={toScreen(pointA, view)} />}
              {mode === 'droite' && trace && (
                <>
                  <PointProvisoire p={toScreen({ x: trace[0], y: trace[1] }, view)} />
                  <PointProvisoire p={toScreen({ x: trace[2], y: trace[3] }, view)} />
                </>
              )}
            </Layer>
          </Stage>
        )}
        {vise && view && fondPret && taille && (
          <Loupe
            dessinerFond={dessinerFond}
            view={view}
            cible={vise}
            depart={mode === 'cote' ? pointA : null}
            largeurCadre={taille.w}
          />
        )}
        <div className="consigne">{erreur ?? consigne}</div>
      </div>

      <footer className={`outils ${feuille ? 'outils-croquis' : ''}`}>
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
            {feuille && (
              <>
                <button className={`btn ${mode === 'droite' ? 'actif' : ''}`} onClick={() => changerMode('droite')}>
                  ╱ Droite
                </button>
                <button className={`btn ${mode === 'libre' ? 'actif' : ''}`} onClick={() => changerMode('libre')}>
                  ✎ Libre
                </button>
              </>
            )}
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
                : [...ann.reperes, { id: newId(), photoId: supportId, position: dialogue.position, texte, updatedAt: Date.now() }],
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
