import { useState } from 'react'

const LIBELLES_RAPIDES = ['Longueur', 'Hauteur', 'Largeur', 'Entraxe', 'Épaisseur']
const LIBELLES_RAPIDES_ANGLE = ['Pente', 'Onglet', 'Biais', 'Rampant']
const CHIFFRES_MAX = 6
const DEGRES_MAX = 360

interface Props {
  valeurInitiale: number | null
  libelleInitial: string
  /** Saisie en degrés, avec une décimale possible, au lieu des millimètres. */
  angle?: boolean
  onValider: (valeurMm: number | null, libelle: string) => void
  onAnnuler: () => void
}

/** Saisie de la valeur sans le clavier du téléphone, qui cacherait la photo. */
export function PaveNumerique({ valeurInitiale, libelleInitial, angle = false, onValider, onAnnuler }: Props) {
  const [saisie, setSaisie] = useState(valeurInitiale === null ? '' : String(valeurInitiale))
  const [libelle, setLibelle] = useState(libelleInitial)

  const taper = (c: string) =>
    setSaisie((s) => {
      if (angle) {
        const suite = (s + c).replace(/^0+(?=\d)/, '')
        return /^\d+(\.\d?)?$/.test(suite) && Number(suite) <= DEGRES_MAX ? suite : s
      }
      return s.length >= CHIFFRES_MAX ? s : (s + c).replace(/^0+(?=\d)/, '')
    })
  const valider = () => onValider(saisie === '' ? null : Number(saisie), libelle.trim())

  return (
    <div className="modale-fond" role="dialog" aria-label={angle ? "Valeur de l'angle" : 'Valeur de la cote'}>
      <div className="modale pave">
        <div className="pave-affichage" aria-live="polite">
          <span className={saisie ? '' : 'vide'}>{saisie.replace('.', ',') || '0'}</span>
          <small>{angle ? '°' : 'mm'}</small>
        </div>

        <div className="puces">
          {(angle ? LIBELLES_RAPIDES_ANGLE : LIBELLES_RAPIDES).map((l) => (
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
          {angle ? (
            <button className="touche touche-secondaire" onClick={() => setSaisie((s) => (s === '' ? '0.' : s.includes('.') ? s : `${s}.`))} aria-label="Virgule">
              ,
            </button>
          ) : (
            <button className="touche touche-secondaire" onClick={() => setSaisie('')} aria-label="Effacer tout">
              C
            </button>
          )}
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
