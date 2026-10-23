import { useCallback, useEffect, useState } from 'react'
import { getChantier, listOuvrages, type OuvrageResume } from '../../db/db'
import type { Chantier } from '../../models/types'
import { OuvrageForm } from '../ouvrages/OuvrageForm'
import { Statut } from '../ouvrages/Statut'
import { ChantierForm } from './ChantierForm'

interface Props {
  chantierId: string
  onRetour: () => void
  onOpenOuvrage: (ouvrageId: string) => void
}

export function ChantierPage({ chantierId, onRetour, onOpenOuvrage }: Props) {
  const [chantier, setChantier] = useState<Chantier | null>()
  const [ouvrages, setOuvrages] = useState<OuvrageResume[]>()
  const [modale, setModale] = useState<'chantier' | 'ouvrage' | null>(null)

  const recharger = useCallback(() => {
    getChantier(chantierId).then((c) => setChantier(c ?? null))
    listOuvrages(chantierId).then(setOuvrages)
  }, [chantierId])
  useEffect(recharger, [recharger])

  if (chantier === null) {
    return (
      <div className="ecran">
        <p className="info">Ce chantier n'existe plus.</p>
        <button className="btn" onClick={onRetour}>
          ← Chantiers
        </button>
      </div>
    )
  }
  if (!chantier) return <div className="ecran" />

  const date = chantier.date ? new Date(`${chantier.date}T12:00`).toLocaleDateString('fr-FR') : ''

  return (
    <div className="ecran">
      <header className="barre">
        <button className="btn btn-icone" onClick={onRetour} aria-label="Retour aux chantiers">
          ←
        </button>
        <h1 className="barre-titre">{chantier.nom}</h1>
        <button className="btn" onClick={() => setModale('chantier')}>
          Modifier
        </button>
      </header>

      <dl className="fiche">
        {chantier.client && <Ligne titre="Client" valeur={chantier.client} />}
        {chantier.adresse && <Ligne titre="Adresse" valeur={chantier.adresse} />}
        {date && <Ligne titre="Date" valeur={date} />}
        {chantier.contact && <Ligne titre="Contact" valeur={chantier.contact} />}
      </dl>

      <h2 className="section">Ouvrages</h2>
      <div className="actions-principales actions-une">
        <button className="btn btn-primaire" onClick={() => setModale('ouvrage')}>
          ＋ Ajouter un ouvrage
        </button>
      </div>

      {ouvrages && ouvrages.length === 0 && <p className="info">Aucun ouvrage pour l'instant.</p>}

      <ul className="liste">
        {ouvrages?.map(({ ouvrage, nbPhotos }) => (
          <li key={ouvrage.id}>
            <button className="carte" onClick={() => onOpenOuvrage(ouvrage.id)}>
              <span className="carte-titre">
                {ouvrage.type}
                {ouvrage.repere && ` · ${ouvrage.repere}`}
              </span>
              {ouvrage.localisation && <span className="carte-detail">{ouvrage.localisation}</span>}
              <span className="carte-statuts">
                <Statut statut={ouvrage.statut} />
                <span className="carte-detail">
                  {nbPhotos} photo{nbPhotos > 1 ? 's' : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {modale === 'chantier' && (
        <ChantierForm
          chantier={chantier}
          onAnnuler={() => setModale(null)}
          onEnregistre={(c) => {
            setModale(null)
            setChantier(c)
          }}
          onSupprime={onRetour}
        />
      )}
      {modale === 'ouvrage' && (
        <OuvrageForm
          chantierId={chantier.id}
          onAnnuler={() => setModale(null)}
          onEnregistre={(o) => {
            setModale(null)
            onOpenOuvrage(o.id)
          }}
        />
      )}
    </div>
  )
}

export function Ligne({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="fiche-ligne">
      <dt>{titre}</dt>
      <dd>{valeur}</dd>
    </div>
  )
}
