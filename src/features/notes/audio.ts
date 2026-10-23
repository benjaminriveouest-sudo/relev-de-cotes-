/** Formats essayés dans l'ordre : Safari (iPhone) n'enregistre qu'en MP4, Chrome et Firefox en WebM. */
const FORMATS = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

export function formatAudio(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined
  return FORMATS.find((f) => MediaRecorder.isTypeSupported(f))
}

export function enregistrementPossible(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/** Durée lisible : 0:07, 2:45. */
export function formatDuree(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Message compréhensible quand le micro est refusé ou absent. */
export function messageErreurMicro(e: unknown): string {
  const nom = e instanceof DOMException ? e.name : ''
  if (nom === 'NotAllowedError' || nom === 'SecurityError')
    return "Micro refusé. Autorisez le micro pour cette appli dans les réglages du téléphone, puis réessayez."
  if (nom === 'NotFoundError') return 'Aucun micro trouvé sur cet appareil.'
  return `Enregistrement impossible (${e instanceof Error ? e.message : e}).`
}
