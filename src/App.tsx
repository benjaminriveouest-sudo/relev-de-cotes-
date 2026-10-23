import { useEffect, useState } from 'react'
import { demanderStockagePersistant } from './db/db'
import { Editor } from './features/annotation/Editor'
import { ChantierList } from './features/chantiers/ChantierList'
import { ChantierPage } from './features/chantiers/ChantierPage'
import { CroquisEditor } from './features/croquis/CroquisEditor'
import { OuvragePage } from './features/ouvrages/OuvragePage'

type Route =
  | { ecran: 'chantiers' }
  | { ecran: 'chantier'; id: string }
  | { ecran: 'ouvrage'; id: string }
  | { ecran: 'photo'; ouvrageId: string; id: string }
  | { ecran: 'croquis'; ouvrageId: string; id: string }

/** Route dans l'adresse (#/ouvrage/<id>…) : si le téléphone recharge l'appli, on revient au même endroit. */
function lireRoute(): Route {
  const parties = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  if (parties[0] === 'chantier' && parties[1]) return { ecran: 'chantier', id: parties[1] }
  if (parties[0] === 'ouvrage' && parties[1] && parties[2] === 'photo' && parties[3])
    return { ecran: 'photo', ouvrageId: parties[1], id: parties[3] }
  if (parties[0] === 'ouvrage' && parties[1] && parties[2] === 'croquis' && parties[3])
    return { ecran: 'croquis', ouvrageId: parties[1], id: parties[3] }
  if (parties[0] === 'ouvrage' && parties[1]) return { ecran: 'ouvrage', id: parties[1] }
  return { ecran: 'chantiers' }
}

function aller(...parties: string[]) {
  window.location.hash = parties.length ? '#/' + parties.map(encodeURIComponent).join('/') : ''
}

export default function App() {
  const [route, setRoute] = useState(lireRoute)

  useEffect(() => {
    demanderStockagePersistant()
    const onHash = () => setRoute(lireRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  switch (route.ecran) {
    case 'photo':
      return <Editor key={route.id} photoId={route.id} onRetour={() => aller('ouvrage', route.ouvrageId)} />
    case 'croquis':
      return <CroquisEditor key={route.id} croquisId={route.id} onRetour={() => aller('ouvrage', route.ouvrageId)} />
    case 'ouvrage':
      return (
        <OuvragePage
          key={route.id}
          ouvrageId={route.id}
          onRetour={(chantierId) => (chantierId ? aller('chantier', chantierId) : aller())}
          onOpenPhoto={(photoId) => aller('ouvrage', route.id, 'photo', photoId)}
          onOpenCroquis={(croquisId) => aller('ouvrage', route.id, 'croquis', croquisId)}
        />
      )
    case 'chantier':
      return (
        <ChantierPage
          key={route.id}
          chantierId={route.id}
          onRetour={() => aller()}
          onOpenOuvrage={(id) => aller('ouvrage', id)}
        />
      )
    default:
      return <ChantierList onOpen={(id) => aller('chantier', id)} />
  }
}
