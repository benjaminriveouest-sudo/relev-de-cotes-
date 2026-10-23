import { useState } from 'react'

const REPERES_RAPIDES = ['Axe poteau', 'Nu fini', 'Sol fini', 'Fixation', 'Tableau', 'Allège']

interface Props {
  texteInitial: string
  onValider: (texte: string) => void
  onAnnuler: () => void
}

export function RepereDialog({ texteInitial, onValider, onAnnuler }: Props) {
  const [texte, setTexte] = useState(texteInitial)
  const ok = texte.trim() !== ''

  return (
    <div className="modale-fond" role="dialog" aria-label="Repère texte">
      <div className="modale">
        <h2>Repère</h2>
        <div className="puces">
          {REPERES_RAPIDES.map((r) => (
            <button key={r} className="puce" onClick={() => onValider(r)}>
              {r}
            </button>
          ))}
        </div>
        <input
          className="champ"
          value={texte}
          placeholder="Autre texte…"
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok && onValider(texte.trim())}
        />
        <div className="modale-actions">
          <button className="btn" onClick={onAnnuler}>
            Annuler
          </button>
          <button className="btn btn-primaire" disabled={!ok} onClick={() => onValider(texte.trim())}>
            Valider
          </button>
        </div>
      </div>
    </div>
  )
}
