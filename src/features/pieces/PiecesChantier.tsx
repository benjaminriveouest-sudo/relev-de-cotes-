import { useCallback, useEffect, useState } from 'react'
import { listPieces } from '../../db/db'
import type { Chantier, Piece } from '../../models/types'
import { useSynchro } from '../../sync/synchro'
import { partagePossible, partager, telecharger } from '../export/partage'
import { controlerPiece, fichierFusion, pieceComplete } from './fusion'
import { PieceForm } from './PieceForm'

const mm = (v: number | null) => (v == null ? '—' : v.toLocaleString('fr-FR'))

/** Pièces relevées d'un chantier : saisie des trois cotes et envoi à Fusion by DRZ. */
export function PiecesChantier({ chantier }: { chantier: Chantier }) {
  const [pieces, setPieces] = useState<Piece[]>()
  const [modale, setModale] = useState<Piece | 'nouvelle' | null>(null)
  const [message, setMessage] = useState<string>()
  const { versionRecue } = useSynchro()

  const recharger = useCallback(() => {
    listPieces(chantier.id).then(setPieces)
  }, [chantier.id])
  // Recharge aussi quand des modifications arrivent du serveur.
  useEffect(recharger, [recharger, versionRecue])

  const pretes = pieces?.filter(pieceComplete) ?? []

  async function envoyer() {
    if (!pieces) return
    setMessage(undefined)
    try {
      const fichier = fichierFusion(chantier, pieces)
      if (partagePossible(fichier)) {
        if (await partager(fichier)) setMessage('Fichier envoyé. Dans Fusion by DRZ : Travaux › Relevé › Importer une pièce relevée.')
      } else {
        telecharger(fichier)
        setMessage(`« ${fichier.name} » téléchargé. Dans Fusion by DRZ : Travaux › Relevé › Importer une pièce relevée.`)
      }
    } catch (err) {
      setMessage(`Envoi impossible (${err instanceof Error ? err.message : err}).`)
    }
  }

  const fermer = () => {
    setModale(null)
    recharger()
  }

  return (
    <>
      <h2 className="section">Pièces relevées</h2>
      <div className="actions-principales actions-une">
        <button className="btn btn-primaire" onClick={() => setModale('nouvelle')}>
          ＋ Ajouter une pièce
        </button>
      </div>

      {pieces && pieces.length === 0 && (
        <p className="info">Largeur, profondeur et hauteur sous plafond : Fusion by DRZ crée la pièce sans ressaisie.</p>
      )}

      <ul className="liste">
        {pieces?.map((piece) => {
          const soucis = controlerPiece(piece)
          return (
            <li key={piece.id}>
              <button className="carte" onClick={() => setModale(piece)}>
                <span className="carte-titre">{piece.nom}</span>
                <span className="carte-detail">
                  {piece.forme === 'murs' && `${piece.murs?.length ?? 0} murs · hors tout `}
                  {mm(piece.largeurMm)} × {mm(piece.profondeurMm)} × {mm(piece.hauteurMm)} mm
                </span>
                {piece.remarque && <span className="carte-detail">{piece.remarque}</span>}
                {soucis.length > 0 && <span className="carte-detail">À compléter : {soucis.join(' ; ')}</span>}
              </button>
            </li>
          )
        })}
      </ul>

      {pieces && pieces.length > 0 && (
        <div className="export">
          <button className="btn btn-large" onClick={envoyer} disabled={pretes.length === 0}>
            🧰 Envoyer à Fusion by DRZ ({pretes.length} pièce{pretes.length > 1 ? 's' : ''} prête{pretes.length > 1 ? 's' : ''})
          </button>
          {message && <p className="info">{message}</p>}
        </div>
      )}

      {modale && (
        <PieceForm
          chantierId={chantier.id}
          piece={modale === 'nouvelle' ? undefined : modale}
          onAnnuler={() => setModale(null)}
          onEnregistre={fermer}
          onSupprime={fermer}
        />
      )}
    </>
  )
}
