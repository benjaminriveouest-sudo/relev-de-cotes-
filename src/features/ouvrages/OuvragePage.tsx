import { useEffect, useState } from 'react'
import { getChantier, getOuvrage, saveOuvrage } from '../../db/db'
import { STATUTS, type Chantier, type Ouvrage, type StatutOuvrage } from '../../models/types'
import { peutValider, useCompte } from '../../sync/compte'
import { BarreSynchro } from '../compte/BarreSynchro'
import { Ligne } from '../chantiers/ChantierPage'
import { CroquisList } from '../croquis/CroquisList'
import { NoteOuvrage } from '../notes/NoteOuvrage'
import { ExportPdf } from '../export/ExportPdf'
import { exporterOuvrage } from '../export/exporter'
import { NotesVocales } from '../notes/NotesVocales'
import { PhotoList } from '../photos/PhotoList'
import { OuvrageForm } from './OuvrageForm'

interface Props {
  ouvrageId: string
  /** Revient au chantier de l'ouvrage (ou à la liste s'il n'existe plus). */
  onRetour: (chantierId?: string) => void
  onOpenPhoto: (photoId: string) => void
  onOpenCroquis: (croquisId: string) => void
  /** Recharge l'écran (modifications arrivées du serveur). */
  onActualiser?: () => void
}

export function OuvragePage({ ouvrageId, onRetour, onOpenPhoto, onOpenCroquis, onActualiser }: Props) {
  const bureau = peutValider(useCompte())
  const [ouvrage, setOuvrage] = useState<Ouvrage | null>()
  const [chantier, setChantier] = useState<Chantier>()
  const [modification, setModification] = useState(false)
  const [erreur, setErreur] = useState<string>()

  useEffect(() => {
    let annule = false
    getOuvrage(ouvrageId).then(async (o) => {
      const c = o && (await getChantier(o.chantierId))
      if (annule) return
      setOuvrage(o ?? null)
      setChantier(c)
    })
    return () => {
      annule = true
    }
  }, [ouvrageId])

  if (ouvrage === null) {
    return (
      <div className="ecran">
        <p className="info">Cet ouvrage n'existe plus.</p>
        <button className="btn" onClick={() => onRetour()}>
          ← Chantiers
        </button>
      </div>
    )
  }
  if (!ouvrage) return <div className="ecran" />

  async function changerStatut(statut: StatutOuvrage) {
    if (!ouvrage || statut === ouvrage.statut) return
    const modifie = { ...ouvrage, statut }
    try {
      await saveOuvrage(modifie)
      setOuvrage(modifie)
    } catch (e) {
      setErreur(`Enregistrement impossible (${e instanceof Error ? e.message : e}).`)
    }
  }

  return (
    <div className="ecran">
      <header className="barre">
        <button className="btn btn-icone" onClick={() => onRetour(ouvrage.chantierId)} aria-label="Retour au chantier">
          ←
        </button>
        <div className="barre-titre">
          <h1>
            {ouvrage.type}
            {ouvrage.repere && ` · ${ouvrage.repere}`}
          </h1>
          {chantier && <div className="barre-sous-titre">{chantier.nom}</div>}
        </div>
        <button className="btn" onClick={() => setModification(true)}>
          Modifier
        </button>
      </header>
      <BarreSynchro onActualiser={onActualiser} />

      {ouvrage.localisation && (
        <dl className="fiche">
          <Ligne titre="Localisation" valeur={ouvrage.localisation} />
        </dl>
      )}

      <div className="statuts-choix" role="group" aria-label="Statut de l'ouvrage">
        {STATUTS.map((s) => (
          <button
            key={s.valeur}
            className={`btn statut-btn statut-${s.valeur} ${ouvrage.statut === s.valeur ? 'actif' : ''}`}
            aria-pressed={ouvrage.statut === s.valeur}
            // Seul le bureau met « Validé » ou retire une validation.
            disabled={!bureau && (s.valeur === 'valide' || ouvrage.statut === 'valide')}
            onClick={() => changerStatut(s.valeur)}
          >
            {s.libelle}
          </button>
        ))}
      </div>
      {!bureau && <p className="statut-verrou">Seul le bureau peut valider un ouvrage.</p>}
      {erreur && <p className="info erreur">{erreur}</p>}

      <div className="export">
        <ExportPdf libelle="📄 Fiche PDF de l'ouvrage" creer={(auteur, progres) => exporterOuvrage(ouvrage.id, auteur, progres)} />
      </div>

      <h2 className="section">Photos</h2>
      <PhotoList ouvrageId={ouvrage.id} onOpen={onOpenPhoto} />

      <h2 className="section">Croquis</h2>
      <CroquisList ouvrageId={ouvrage.id} onOpen={onOpenCroquis} />

      <h2 className="section">Notes</h2>
      <NoteOuvrage ouvrageId={ouvrage.id} />

      <h2 className="section">Notes vocales</h2>
      <NotesVocales ouvrageId={ouvrage.id} />

      {modification && (
        <OuvrageForm
          chantierId={ouvrage.chantierId}
          ouvrage={ouvrage}
          onAnnuler={() => setModification(false)}
          onEnregistre={(o) => {
            setModification(false)
            setOuvrage(o)
          }}
          onSupprime={() => onRetour(ouvrage.chantierId)}
        />
      )}
    </div>
  )
}
