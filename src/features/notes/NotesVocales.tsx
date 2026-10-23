import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteNoteVocale, listNotesVocales, saveNoteVocale } from '../../db/db'
import { newId } from '../../models/id'
import type { NoteVocale } from '../../models/types'
import { useObjectUrl } from '../../ui/useObjectUrl'
import { enregistrementPossible, formatAudio, formatDuree, messageErreurMicro } from './audio'

/** Au-delà, l'enregistrement s'arrête tout seul (une note vocale, pas un dictaphone). */
const DUREE_MAX_MS = 10 * 60 * 1000
/** L'audio est écrit en base toutes les secondes : rien n'est perdu si l'appli se ferme. */
const MORCEAU_MS = 1000

interface Enregistrement {
  recorder: MediaRecorder
  stream: MediaStream
  debut: number
}

export function NotesVocales({ ouvrageId }: { ouvrageId: string }) {
  const [notes, setNotes] = useState<NoteVocale[]>()
  const [enCours, setEnCours] = useState<Enregistrement | null>(null)
  const [demarrage, setDemarrage] = useState(false)
  const [maintenant, setMaintenant] = useState(0)
  const [erreur, setErreur] = useState<string>()
  const enCoursRef = useRef<Enregistrement | null>(null)

  const recharger = useCallback(() => {
    listNotesVocales(ouvrageId).then(setNotes)
  }, [ouvrageId])
  useEffect(recharger, [recharger])

  const arreter = useCallback(() => {
    const e = enCoursRef.current
    if (e && e.recorder.state !== 'inactive') e.recorder.stop()
  }, [])

  // Arrêt propre si on quitte la fiche ou si l'appli passe en arrière-plan (l'iPhone coupe le micro).
  useEffect(() => {
    const onCache = () => document.visibilityState === 'hidden' && arreter()
    document.addEventListener('visibilitychange', onCache)
    return () => {
      document.removeEventListener('visibilitychange', onCache)
      arreter()
    }
  }, [arreter])

  // Chronomètre affiché, et arrêt automatique à la durée maximale.
  useEffect(() => {
    if (!enCours) return
    const t = window.setInterval(() => {
      const now = Date.now()
      setMaintenant(now)
      if (now - enCours.debut >= DUREE_MAX_MS) arreter()
    }, 250)
    return () => window.clearInterval(t)
  }, [enCours, arreter])

  async function demarrer() {
    setErreur(undefined)
    if (!enregistrementPossible()) {
      setErreur("Ce navigateur ne permet pas d'enregistrer le son.")
      return
    }
    setDemarrage(true)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      setErreur(messageErreurMicro(e))
      setDemarrage(false)
      return
    }

    let recorder: MediaRecorder
    try {
      const format = formatAudio()
      recorder = new MediaRecorder(stream, format ? { mimeType: format } : undefined)
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop())
      setErreur(messageErreurMicro(e))
      setDemarrage(false)
      return
    }

    const debut = Date.now()
    const note: Omit<NoteVocale, 'audio' | 'dureeMs' | 'updatedAt'> = { id: newId(), ouvrageId, createdAt: debut }
    const morceaux: Blob[] = []
    // Écritures enchaînées dans l'ordre, la dernière contient tout l'audio.
    let ecriture = Promise.resolve()

    recorder.ondataavailable = (ev) => {
      if (ev.data.size === 0) return
      morceaux.push(ev.data)
      const audio = new Blob(morceaux, { type: recorder.mimeType || ev.data.type })
      const dureeMs = Date.now() - debut
      ecriture = ecriture
        .then(() => saveNoteVocale({ ...note, audio, dureeMs, updatedAt: 0 }))
        .catch((e) => setErreur(`Sauvegarde impossible : ${e instanceof Error ? e.message : e}`))
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      enCoursRef.current = null
      setEnCours(null)
      // Laisse passer le dernier morceau, livré juste avant l'arrêt.
      window.setTimeout(() => ecriture.then(recharger), 0)
    }

    const e: Enregistrement = { recorder, stream, debut }
    enCoursRef.current = e
    recorder.start(MORCEAU_MS)
    setMaintenant(debut)
    setEnCours(e)
    setDemarrage(false)
  }

  async function supprimer(id: string) {
    if (!window.confirm('Supprimer cette note vocale ?')) return
    await deleteNoteVocale(id)
    recharger()
  }

  return (
    <>
      <div className="actions-principales actions-une">
        {enCours ? (
          <button className="btn btn-danger btn-enregistre" onClick={arreter}>
            ■ Arrêter · {formatDuree(maintenant - enCours.debut)}
          </button>
        ) : (
          <button className="btn" disabled={demarrage} onClick={demarrer}>
            🎙️ Enregistrer une note vocale
          </button>
        )}
      </div>
      {erreur && <p className="info erreur">{erreur}</p>}

      <ul className="liste">
        {notes?.map((n, i) => (
            <li key={n.id}>
              <Lecteur note={n} numero={notes.length - i} onSupprimer={() => supprimer(n.id)} />
            </li>
          ))}
      </ul>
    </>
  )
}

function Lecteur({ note, numero, onSupprimer }: { note: NoteVocale; numero: number; onSupprimer: () => void }) {
  const url = useObjectUrl(note.audio)
  return (
    <div className="carte note-vocale">
      <div className="note-vocale-entete">
        <span className="carte-titre">Note vocale {numero}</span>
        <span className="carte-detail">
          {formatDuree(note.dureeMs)} ·{' '}
          {new Date(note.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
        <button className="btn btn-icone" onClick={onSupprimer} aria-label="Supprimer la note vocale">
          🗑
        </button>
      </div>
      {url && <audio controls preload="metadata" src={url} />}
    </div>
  )
}
