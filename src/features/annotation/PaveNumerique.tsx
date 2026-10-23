import { useState } from 'react'

const LIBELLES_RAPIDES = ['Longueur', 'Hauteur', 'Largeur', 'Entraxe', 'Épaisseur']
const CHIFFRES_MAX = 6

interface Props {
  valeurInitiale: number | null
  libelleInitial: string
  onValider: (valeurMm: number | null, libelle: string) => void
  onAnnuler: () => void
}

/** Saisie de la valeur en mm sans le clavier du téléphone, qui cacherait la photo. */
export function PaveNumerique({ valeurInitiale, libelleInitial, onValider, onAnnuler }: Props) {
  const [saisie, setSaisie] = useState(valeurInitiale === null ? '' : String(valeurInitiale))
  const [libelle, setLibelle] = useState(libelleInitial)

  const taper = (c: string) => setSaisie((s) => (s.length >= CHIFFRES_MAX ? s : (s + c).replace(/^0+(?=\d)/, '')))
  const valider = () => onValider(saisie === '' ? null : Number(saisie), libelle.trim())

  return (
    <div className="modale-fond" role="dialog" aria-label="Valeur de la cote">
      <div className="modale pave">
        <div className="pave-affichage" aria-live="polite">
          <span className={saisie ? '' : 'vide'}>{saisie || '0'}</span>
          <small>mm</small>
        </div>

        <div className="puces">
          {LIBELLES_RAPIDES.map((l) => (
            <button key={l} className={`puce ${libelle === l ? 'active' : ''}`} onClick={() => setLibelle(libelle === l ? '' : l)}>
              {l}
            </button>
          ))}
        </div>

        <div className="pave-touches">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => (
            <button key={c} className="touche" onClick={() => taper(c)}>
              {c}
            </button>
          ))}
          <button className="touche touche-secondaire" onClick={() => setSaisie('')} aria-label="Effacer tout">
            C
          </button>
          <button className="touche" onClick={() => taper('0')}>
            0
          </button>
          <button className="touche touche-secondaire" onClick={() => setSaisie((s) => s.slice(0, -1))} aria-label="Effacer">
            ⌫
          </button>
        </div>

        <div className="modale-actions">
          <button className="btn" onClick={onAnnuler}>
            Annuler
          </button>
          <button className="btn btn-primaire" onClick={valider}>
            {saisie === '' ? 'Plus tard' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  )
}
