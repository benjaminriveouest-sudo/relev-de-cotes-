import { useEffect, useState } from 'react'
import { deleteCroquis, getCroquis, loadAnnotations } from '../../db/db'
import type { Annotations, Croquis } from '../../models/types'
import { EditeurCalque } from '../annotation/Editor'
import { createHistory, type History } from '../annotation/history'

interface Props {
  croquisId: string
  onRetour: () => void
}

export function CroquisEditor({ croquisId, onRetour }: Props) {
  const [croquis, setCroquis] = useState<Croquis | null>()
  const [historique, setHistorique] = useState<History<Annotations>>()

  useEffect(() => {
    let annule = false
    Promise.all([getCroquis(croquisId), loadAnnotations(croquisId)]).then(([c, ann]) => {
      if (annule) return
      setCroquis(c ?? null)
      setHistorique(createHistory(ann))
    })
    return () => {
      annule = true
    }
  }, [croquisId])

  if (croquis === null) {
    return (
      <div className="ecran">
        <p className="info">Ce croquis n'existe plus.</p>
        <button className="btn" onClick={onRetour}>
          ← Ouvrage
        </button>
      </div>
    )
  }
  if (!croquis || !historique) return <div className="ecran" />

  return (
    <EditeurCalque
      supportId={croquis.id}
      largeur={croquis.largeur}
      hauteur={croquis.hauteur}
      feuille={croquis}
      historique={historique}
      setHistorique={setHistorique}
      onRetour={onRetour}
      questionSuppression="Supprimer ce croquis et toutes ses cotes ?"
      supprimer={() => deleteCroquis(croquis.id)}
    />
  )
}
