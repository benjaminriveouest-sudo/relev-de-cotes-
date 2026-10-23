import { useEffect, useState } from 'react'
import { demanderStockagePersistant } from './db/db'
import { Editor } from './features/annotation/Editor'
import { PhotoList } from './features/photos/PhotoList'

/** Route dans l'adresse (#/photo/<id>) : si le téléphone recharge l'appli, on revient sur la même photo. */
function lireRoute(): string | null {
  const m = window.location.hash.match(/^#\/photo\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export default function App() {
  const [photoId, setPhotoId] = useState(lireRoute)

  useEffect(() => {
    demanderStockagePersistant()
    const onHash = () => setPhotoId(lireRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (photoId) return <Editor key={photoId} photoId={photoId} onRetour={() => (window.location.hash = '')} />
  return <PhotoList onOpen={(id) => (window.location.hash = `#/photo/${encodeURIComponent(id)}`)} />
}
