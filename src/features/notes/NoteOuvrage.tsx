import { useEffect, useRef, useState } from 'react'
import { getNote, saveNote } from '../../db/db'
import { CASES_A_COCHER, type Note } from '../../models/types'

const DELAI_SAUVEGARDE = 600

/** Cases à cocher et note écrite de l'ouvrage, enregistrées automatiquement. */
export function NoteOuvrage({ ouvrageId }: { ouvrageId: string }) {
  const [note, setNote] = useState<Note>()
  const [etat, setEtat] = useState<'enregistre' | 'en_attente' | 'erreur' | null>(null)
  const enAttente = useRef<Note | null>(null)
  const minuteur = useRef<number>(undefined)

  useEffect(() => {
    let annule = false
    getNote(ouvrageId).then((n) => !annule && setNote(n))
    return () => {
      annule = true
    }
  }, [ouvrageId])

  // Écrit tout de suite ce qui attend : appelé aussi quand l'appli passe en arrière-plan ou qu'on quitte la fiche.
  const ecrire = useRef(() => {
    window.clearTimeout(minuteur.current)
    const n = enAttente.current
    if (!n) return
    enAttente.current = null
    saveNote(n).then(
      () => setEtat((e) => (enAttente.current ? e : 'enregistre')),
      () => setEtat('erreur'),
    )
  })

  useEffect(() => {
    const ecrireMaintenant = ecrire.current
    const onCache = () => document.visibilityState === 'hidden' && ecrireMaintenant()
    document.addEventListener('visibilitychange', onCache)
    window.addEventListener('pagehide', ecrireMaintenant)
    return () => {
      document.removeEventListener('visibilitychange', onCache)
      window.removeEventListener('pagehide', ecrireMaintenant)
      ecrireMaintenant()
    }
  }, [])

  function modifier(n: Note, toutDeSuite = false) {
    setNote(n)
    setEtat('en_attente')
    enAttente.current = n
    window.clearTimeout(minuteur.current)
    if (toutDeSuite) ecrire.current()
    else minuteur.current = window.setTimeout(ecrire.current, DELAI_SAUVEGARDE)
  }

  if (!note) return null

  function basculer(id: string) {
    if (!note) return
    const cases = note.cases.includes(id) ? note.cases.filter((c) => c !== id) : [...note.cases, id]
    modifier({ ...note, cases }, true)
  }

  return (
    <div className="notes">
      {CASES_A_COCHER.map((g) => (
        <fieldset key={g.groupe} className="cases-groupe">
          <legend>{g.groupe}</legend>
          <div className="puces">
            {g.cases.map((c) => {
              const coche = note.cases.includes(c.id)
              return (
                <button key={c.id} className={`puce ${coche ? 'active' : ''}`} aria-pressed={coche} onClick={() => basculer(c.id)}>
                  {coche ? '☑' : '☐'} {c.libelle}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
      <label className="note-texte">
        Note
        <textarea
          className="champ"
          rows={4}
          value={note.texte}
          placeholder="Remarques, points à vérifier…"
          onChange={(e) => modifier({ ...note, texte: e.target.value })}
          onBlur={() => ecrire.current()}
        />
      </label>
      <p className={`etat-sauvegarde ${etat === 'erreur' ? 'erreur' : ''}`}>
        {etat === 'erreur' ? 'Enregistrement impossible' : etat === 'en_attente' ? 'Enregistrement…' : etat === 'enregistre' ? 'Enregistré' : ''}
      </p>
    </div>
  )
}
