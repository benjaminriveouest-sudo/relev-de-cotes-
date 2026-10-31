import { useCallback, useEffect, useRef, useState } from 'react'
import { addPhoto, listPhotos, type PhotoResume } from '../../db/db'
import { useObjectUrl } from '../../ui/useObjectUrl'
import { preparePhoto } from './preparePhoto'
import { preparePlan } from './preparePlan'

interface Props {
  ouvrageId: string
  onOpen: (photoId: string) => void
}

export function PhotoList({ ouvrageId, onOpen }: Props) {
  const [photos, setPhotos] = useState<PhotoResume[]>()
  const [occupe, setOccupe] = useState(false)
  const [progres, setProgres] = useState('Préparation de la photo…')
  const [erreur, setErreur] = useState<string>()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galerieRef = useRef<HTMLInputElement>(null)
  const planRef = useRef<HTMLInputElement>(null)

  const recharger = useCallback(() => {
    listPhotos(ouvrageId).then(setPhotos)
  }, [ouvrageId])
  useEffect(recharger, [recharger])

  async function importer(files: FileList | null) {
    if (!files || files.length === 0) return
    // Compté avant de vider le champ : sur Chrome, la liste de fichiers se vide avec lui.
    const nbFichiers = files.length
    setProgres('Préparation de la photo…')
    setOccupe(true)
    setErreur(undefined)
    let derniere: string | undefined
    try {
      for (const file of Array.from(files)) {
        const photo = await preparePhoto(file, ouvrageId)
        await addPhoto(photo)
        derniere = photo.id
      }
    } catch (e) {
      setErreur(`Impossible d'importer la photo (${e instanceof Error ? e.message : e}).`)
    } finally {
      setOccupe(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galerieRef.current) galerieRef.current.value = ''
    }
    // Une seule photo prise : on passe directement à l'annotation.
    if (derniere && nbFichiers === 1) onOpen(derniere)
    else recharger()
  }

  async function importerPlan(file: File | undefined) {
    if (!file) return
    setProgres('Lecture du plan…')
    setOccupe(true)
    setErreur(undefined)
    let derniere: string | undefined
    let nbPages = 0
    try {
      await preparePlan(file, ouvrageId, async (photo, numero, total) => {
        await addPhoto(photo)
        derniere = photo.id
        nbPages = total
        setProgres(`Plan : page ${numero} sur ${total} prête…`)
      })
    } catch (e) {
      setErreur(`Impossible d'importer le plan (${e instanceof Error ? e.message : e}).`)
    } finally {
      setOccupe(false)
      if (planRef.current) planRef.current.value = ''
    }
    // Plan d'une seule page : on passe directement aux cotes.
    if (derniere && nbPages === 1) onOpen(derniere)
    else recharger()
  }

  return (
    <>
      <div className="actions-principales">
        <button className="btn btn-primaire" disabled={occupe} onClick={() => cameraRef.current?.click()}>
          📷 Prendre une photo
        </button>
        <button className="btn" disabled={occupe} onClick={() => galerieRef.current?.click()}>
          🖼️ Importer
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => importer(e.target.files)}
        />
        <input ref={galerieRef} type="file" accept="image/*" multiple hidden onChange={(e) => importer(e.target.files)} />
        <button className="btn import-plan" disabled={occupe} onClick={() => planRef.current?.click()}>
          📐 Importer un plan PDF
        </button>
        <input ref={planRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => importerPlan(e.target.files?.[0])} />
      </div>

      {occupe && <p className="info">{progres}</p>}
      {erreur && <p className="info erreur">{erreur}</p>}

      {photos && photos.length === 0 && (
        <p className="info">Aucune photo pour l'instant. Prenez une photo ou importez le plan de l'architecte pour relever cet ouvrage.</p>
      )}

      <ul className="grille">
        {photos?.map(({ photo, nbCotes }) => (
          <li key={photo.id}>
            <Miniature blob={photo.thumb} nbCotes={nbCotes} date={photo.createdAt} onClick={() => onOpen(photo.id)} />
          </li>
        ))}
      </ul>
    </>
  )
}

function Miniature({ blob, nbCotes, date, onClick }: { blob: Blob; nbCotes: number; date: number; onClick: () => void }) {
  const url = useObjectUrl(blob)
  return (
    <button className="miniature" onClick={onClick}>
      {url && <img src={url} alt="" />}
      <span className="miniature-legende">
        {nbCotes} cote{nbCotes > 1 ? 's' : ''} ·{' '}
        {new Date(date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </span>
    </button>
  )
}
