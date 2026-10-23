import { useState } from 'react'
import { useCompte } from '../../sync/compte'
import { synchroniserMaintenant, useSynchro } from '../../sync/synchro'

const pluriel = (n: number) => (n > 1 ? 's' : '')

/**
 * État de l'envoi, sous la barre de titre, quand on est connecté.
 * Avec onActualiser, propose de recharger l'écran quand des modifications sont arrivées.
 */
export function BarreSynchro({ onActualiser }: { onActualiser?: () => void }) {
  const compte = useCompte()
  const synchro = useSynchro()
  const [versionVue] = useState(synchro.versionRecue)
  if (compte.statut !== 'connecte') return null

  const n = synchro.enAttente
  const attente = `${n} élément${pluriel(n)} en attente d'envoi`
  let texte: string
  let classe = ''
  if (synchro.enCours) texte = '⟳ Synchronisation…'
  else if (synchro.horsLigne) texte = n ? `Hors ligne · ${attente}` : 'Hors ligne · tout est enregistré sur le téléphone'
  else if (synchro.erreur) {
    texte = `⚠ Envoi impossible${n ? ` · ${attente}` : ''} · toucher pour réessayer`
    classe = 'synchro-erreur'
  } else if (n) texte = `${attente} · toucher pour envoyer`
  else {
    texte = '✓ À jour'
    classe = 'synchro-ok'
  }

  return (
    <>
      <button className={`synchro ${classe}`} onClick={() => void synchroniserMaintenant()} disabled={synchro.enCours}>
        {texte}
      </button>
      {onActualiser && synchro.versionRecue !== versionVue && (
        <button className="synchro synchro-nouveau" onClick={onActualiser}>
          Des modifications sont arrivées · toucher pour actualiser
        </button>
      )}
    </>
  )
}
