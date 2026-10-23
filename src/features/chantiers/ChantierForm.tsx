import { useState } from 'react'
import { dateDuJour, deleteChantier, saveChantier } from '../../db/db'
import { newId } from '../../models/id'
import type { Chantier } from '../../models/types'

interface Props {
  /** Absent : création d'un nouveau chantier. */
  chantier?: Chantier
  onAnnuler: () => void
  onEnregistre: (chantier: Chantier) => void
  onSupprime?: () => void
}

export function ChantierForm({ chantier, onAnnuler, onEnregistre, onSupprime }: Props) {
  const [valeurs, setValeurs] = useState(() => {
    const now = Date.now()
    return (
      chantier ?? {
        id: newId(),
        nom: '',
        client: '',
        adresse: '',
        contact: '',
        date: dateDuJour(),
        createdAt: now,
        updatedAt: now,
      }
    )
  })
  const [erreur, setErreur] = useState<string>()

  const changer = (champ: keyof Chantier) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValeurs({ ...valeurs, [champ]: e.target.value })

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    const propre = { ...valeurs, nom: valeurs.nom.trim() }
    if (!propre.nom) return setErreur('Donnez un nom au chantier.')
    try {
      await saveChantier(propre)
      onEnregistre(propre)
    } catch (err) {
      setErreur(`Enregistrement impossible (${err instanceof Error ? err.message : err}).`)
    }
  }

  async function supprimer() {
    if (!chantier) return
    if (!window.confirm(`Supprimer le chantier « ${chantier.nom} » avec tous ses ouvrages et photos ?`)) return
    await deleteChantier(chantier.id)
    onSupprime?.()
  }

  return (
    <div className="modale-fond" onClick={onAnnuler}>
      <form className="modale formulaire" onClick={(e) => e.stopPropagation()} onSubmit={enregistrer}>
        <h2>{chantier ? 'Modifier le chantier' : 'Nouveau chantier'}</h2>
        <label>
          Nom du chantier
          <input className="champ" value={valeurs.nom} onChange={changer('nom')} autoFocus={!chantier} />
        </label>
        <label>
          Client
          <input className="champ" value={valeurs.client} onChange={changer('client')} />
        </label>
        <label>
          Adresse
          <input className="champ" value={valeurs.adresse} onChange={changer('adresse')} />
        </label>
        <label>
          Date
          <input className="champ" type="date" value={valeurs.date} onChange={changer('date')} />
        </label>
        <label>
          Contact sur place
          <input
            className="champ"
            value={valeurs.contact}
            onChange={changer('contact')}
            placeholder="Nom et téléphone"
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
        {chantier && (
          <button type="button" className="btn btn-danger btn-large" onClick={supprimer}>
            Supprimer le chantier
          </button>
        )}
      </form>
    </div>
  )
}
