import { useEffect, useMemo, useState } from 'react'
import { listChantiers, type ChantierResume } from '../../db/db'
import { STATUTS, type StatutOuvrage } from '../../models/types'
import { useCompte } from '../../sync/compte'
import { useSynchro } from '../../sync/synchro'
import { BarreSynchro } from '../compte/BarreSynchro'
import { Statut } from '../ouvrages/Statut'
import { ChantierForm } from './ChantierForm'
import { filtrerChantiers } from './filtre'

interface Props {
  onOpen: (chantierId: string) => void
  onCompte: () => void
}

export function ChantierList({ onOpen, onCompte }: Props) {
  const compte = useCompte()
  const { versionRecue } = useSynchro()
  const [chantiers, setChantiers] = useState<ChantierResume[]>()
  const [recherche, setRecherche] = useState('')
  const [statut, setStatut] = useState<StatutOuvrage | null>(null)
  const [creation, setCreation] = useState(false)

  useEffect(() => {
    listChantiers().then(setChantiers)
  }, [versionRecue])

  const visibles = useMemo(
    () => (chantiers ? filtrerChantiers(chantiers, recherche, statut) : undefined),
    [chantiers, recherche, statut],
  )

  return (
    <div className="ecran">
      <header className="barre">
        <h1 className="barre-titre">Chantiers</h1>
        {compte.statut !== 'non_configure' && (
          <button className="btn" onClick={onCompte}>
            {compte.statut === 'connecte' ? `👤 ${compte.membre.nom}` : '👤 Compte'}
          </button>
        )}
      </header>
      <BarreSynchro />

      <div className="actions-principales actions-une">
        <button className="btn btn-primaire" onClick={() => setCreation(true)}>
          ＋ Nouveau chantier
        </button>
      </div>

      {chantiers && chantiers.length > 0 && (
        <div className="filtres">
          <input
            className="champ"
            type="search"
            placeholder="Rechercher (nom, client, adresse)"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <div className="puces">
            <button className={`puce ${statut === null ? 'active' : ''}`} onClick={() => setStatut(null)}>
              Tous
            </button>
            {STATUTS.map((s) => (
              <button
                key={s.valeur}
                className={`puce ${statut === s.valeur ? 'active' : ''}`}
                onClick={() => setStatut(statut === s.valeur ? null : s.valeur)}
              >
                {s.libelle}
              </button>
            ))}
          </div>
        </div>
      )}

      {chantiers && chantiers.length === 0 && (
        <p className="info">Aucun chantier pour l'instant. Créez-en un pour commencer le relevé.</p>
      )}
      {visibles && chantiers && chantiers.length > 0 && visibles.length === 0 && (
        <p className="info">Aucun chantier ne correspond.</p>
      )}

      <ul className="liste">
        {visibles?.map(({ chantier, statuts }) => (
          <li key={chantier.id}>
            <button className="carte" onClick={() => onOpen(chantier.id)}>
              <span className="carte-titre">{chantier.nom || 'Chantier sans nom'}</span>
              {(chantier.client || chantier.adresse) && (
                <span className="carte-detail">{[chantier.client, chantier.adresse].filter(Boolean).join(' · ')}</span>
              )}
              <span className="carte-statuts">
                {STATUTS.every((s) => statuts[s.valeur] === 0) ? (
                  <span className="carte-detail">Aucun ouvrage</span>
                ) : (
                  STATUTS.filter((s) => statuts[s.valeur] > 0).map((s) => (
                    <Statut key={s.valeur} statut={s.valeur} nombre={statuts[s.valeur]} />
                  ))
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {creation && (
        <ChantierForm
          onAnnuler={() => setCreation(false)}
          onEnregistre={(c) => {
            setCreation(false)
            onOpen(c.id)
          }}
        />
      )}
    </div>
  )
}
