import { useState } from 'react'
import { deletePiece, savePiece } from '../../db/db'
import { newId } from '../../models/id'
import type { Piece } from '../../models/types'
import { controlerPiece, lireCote } from './fusion'

interface Props {
  chantierId: string
  /** Absente : création d'une nouvelle pièce. */
  piece?: Piece
  onAnnuler: () => void
  onEnregistre: (piece: Piece) => void
  onSupprime?: () => void
}

const enTexte = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))

export function PieceForm({ chantierId, piece, onAnnuler, onEnregistre, onSupprime }: Props) {
  const [nom, setNom] = useState(piece?.nom ?? '')
  const [largeur, setLargeur] = useState(enTexte(piece?.largeurMm ?? null))
  const [profondeur, setProfondeur] = useState(enTexte(piece?.profondeurMm ?? null))
  const [hauteur, setHauteur] = useState(enTexte(piece?.hauteurMm ?? null))
  const [remarque, setRemarque] = useState(piece?.remarque ?? '')
  const [erreur, setErreur] = useState<string>()

  function lue(): Piece {
    const now = Date.now()
    return {
      id: piece?.id ?? newId(),
      chantierId,
      nom: nom.trim() || 'Pièce',
      largeurMm: lireCote(largeur),
      profondeurMm: lireCote(profondeur),
      hauteurMm: lireCote(hauteur),
      remarque: remarque.trim(),
      createdAt: piece?.createdAt ?? now,
      updatedAt: now,
    }
  }

  // Les soucis sont signalés mais n'empêchent pas d'enregistrer : on peut relever la pièce en plusieurs fois.
  const soucis = controlerPiece({
    largeurMm: lireCote(largeur),
    profondeurMm: lireCote(profondeur),
    hauteurMm: lireCote(hauteur),
  })

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    const propre = lue()
    try {
      await savePiece(propre)
      onEnregistre(propre)
    } catch (err) {
      setErreur(`Enregistrement impossible (${err instanceof Error ? err.message : err}).`)
    }
  }

  async function supprimer() {
    if (!piece) return
    if (!window.confirm('Supprimer cette pièce relevée ?')) return
    await deletePiece(piece.id)
    onSupprime?.()
  }

  return (
    <div className="modale-fond" onClick={onAnnuler}>
      <form className="modale formulaire" onClick={(e) => e.stopPropagation()} onSubmit={enregistrer}>
        <h2>{piece ? 'Modifier la pièce' : 'Nouvelle pièce'}</h2>
        <label>
          Nom
          <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Boutique, cuisine, réserve…" />
        </label>
        <label>
          Largeur (mm)
          <input
            className="champ"
            inputMode="decimal"
            value={largeur}
            onChange={(e) => setLargeur(e.target.value)}
            placeholder="3600"
          />
        </label>
        <label>
          Profondeur (mm)
          <input
            className="champ"
            inputMode="decimal"
            value={profondeur}
            onChange={(e) => setProfondeur(e.target.value)}
            placeholder="3000"
          />
        </label>
        <label>
          Hauteur sous plafond (mm)
          <input
            className="champ"
            inputMode="decimal"
            value={hauteur}
            onChange={(e) => setHauteur(e.target.value)}
            placeholder="2500"
          />
        </label>
        <label>
          Remarque
          <input
            className="champ"
            value={remarque}
            onChange={(e) => setRemarque(e.target.value)}
            placeholder="Murs pas d'équerre, plafond qui descend…"
          />
        </label>
        {soucis.length > 0 && (
          <p className="info">
            Pas encore prête pour Fusion : {soucis.join(' ; ')}.
          </p>
        )}
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="modale-actions">
          <button type="button" className="btn" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primaire">
            Enregistrer
          </button>
        </div>
        {piece && (
          <button type="button" className="btn btn-danger btn-large" onClick={supprimer}>
            Supprimer la pièce
          </button>
        )}
      </form>
    </div>
  )
}
