import { useState } from 'react'
import { deleteOuvrage, saveOuvrage } from '../../db/db'
import { newId } from '../../models/id'
import { TYPES_OUVRAGE, type Ouvrage } from '../../models/types'

interface Props {
  chantierId: string
  /** Absent : création d'un nouvel ouvrage. */
  ouvrage?: Ouvrage
  onAnnuler: () => void
  onEnregistre: (ouvrage: Ouvrage) => void
  onSupprime?: () => void
}

export function OuvrageForm({ chantierId, ouvrage, onAnnuler, onEnregistre, onSupprime }: Props) {
  const [valeurs, setValeurs] = useState<Ouvrage>(() => {
    const now = Date.now()
    return (
      ouvrage ?? {
        id: newId(),
        chantierId,
        type: TYPES_OUVRAGE[0],
        repere: '',
        localisation: '',
        statut: 'a_relever',
        createdAt: now,
        updatedAt: now,
      }
    )
  })
  const [erreur, setErreur] = useState<string>()

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    const propre = {
      ...valeurs,
      type: valeurs.type.trim() || 'Autre',
      repere: valeurs.repere.trim(),
      localisation: valeurs.localisation.trim(),
    }
    try {
      await saveOuvrage(propre)
      onEnregistre(propre)
    } catch (err) {
      setErreur(`Enregistrement impossible (${err instanceof Error ? err.message : err}).`)
    }
  }

  async function supprimer() {
    if (!ouvrage) return
    if (!window.confirm('Supprimer cet ouvrage avec toutes ses photos et cotes ?')) return
    await deleteOuvrage(ouvrage.id)
    onSupprime?.()
  }

  return (
    <div className="modale-fond" onClick={onAnnuler}>
      <form className="modale formulaire" onClick={(e) => e.stopPropagation()} onSubmit={enregistrer}>
        <h2>{ouvrage ? "Modifier l'ouvrage" : 'Nouvel ouvrage'}</h2>
        <div className="puces">
          {TYPES_OUVRAGE.map((t) => (
            <button
              key={t}
              type="button"
              className={`puce ${valeurs.type === t ? 'active' : ''}`}
              onClick={() => setValeurs({ ...valeurs, type: t })}
            >
              {t}
            </button>
          ))}
        </div>
        <label>
          Type
          <input className="champ" value={valeurs.type} onChange={(e) => setValeurs({ ...valeurs, type: e.target.value })} />
        </label>
        <label>
          Repère
          <input
            className="champ"
            value={valeurs.repere}
            onChange={(e) => setValeurs({ ...valeurs, repere: e.target.value })}
            placeholder="GC1, balcon…"
          />
        </label>
        <label>
          Localisation
          <input
            className="champ"
            value={valeurs.localisation}
            onChange={(e) => setValeurs({ ...valeurs, localisation: e.target.value })}
            placeholder="Façade sud, R+1"
          />
        </label>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="modale-actions">
          <button type="button" className="btn" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primaire">
            Enregistrer
          </button>
        </div>
        {ouvrage && (
          <button type="button" className="btn btn-danger btn-large" onClick={supprimer}>
            Supprimer l'ouvrage
          </button>
        )}
      </form>
    </div>
  )
}
