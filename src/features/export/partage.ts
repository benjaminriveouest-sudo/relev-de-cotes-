const CLE_AUTEUR = 'auteur'

/** Nom de la personne qui fait le relevé, gardé sur ce téléphone (en attendant les comptes). */
export function lireAuteur(): string {
  try {
    return localStorage.getItem(CLE_AUTEUR) ?? ''
  } catch {
    return ''
  }
}

export function ecrireAuteur(nom: string) {
  try {
    localStorage.setItem(CLE_AUTEUR, nom)
  } catch {
    // Stockage refusé (navigation privée) : le nom sera redemandé la prochaine fois.
  }
}

export function fichierPdf(octets: Uint8Array, nom: string): File {
  return new File([octets as BlobPart], nom, { type: 'application/pdf' })
}

/** Vrai si le téléphone sait envoyer un fichier par son menu de partage (iPhone, Android). */
export function partagePossible(fichier: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [fichier] })
  } catch {
    return false
  }
}

/** Ouvre le menu de partage ; renvoie false si la personne l'a fermé sans rien envoyer. */
export async function partager(fichier: File): Promise<boolean> {
  try {
    await navigator.share({ files: [fichier], title: fichier.name })
    return true
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false
    throw e
  }
}

export function telecharger(fichier: File) {
  const url = URL.createObjectURL(fichier)
  const a = document.createElement('a')
  a.href = url
  a.download = fichier.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Laisse au navigateur le temps de lire le fichier avant de le libérer.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
