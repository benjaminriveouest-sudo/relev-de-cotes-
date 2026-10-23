/** Ligne de la table « elements » du serveur : un objet du relevé, sans ses fichiers. */
export interface Ligne {
  id: string
  entreprise_id: string
  table_name: string
  data: Record<string, unknown>
  updated_at: number
  deleted: boolean
}

export interface LigneLue extends Ligne {
  /** Date d'écriture sur le serveur (ISO). */
  server_updated_at: string
}

/** Ce dont la synchronisation a besoin du serveur (Supabase en vrai, une imitation dans les tests). */
export interface Serveur {
  /** Enregistre les lignes ; une ligne plus ancienne que celle du serveur est ignorée. */
  envoyer(lignes: Ligne[]): Promise<void>
  /** Lignes écrites après « depuis » (toutes si null), dans l'ordre d'écriture. */
  lire(depuis: string | null, debut: number, nombre: number): Promise<LigneLue[]>
  deposerFichier(chemin: string, fichier: Blob): Promise<void>
  telechargerFichier(chemin: string): Promise<Blob>
  supprimerFichiers(chemins: string[]): Promise<void>
}

/** Rangement d'un fichier dans le stockage : un dossier par entreprise. */
export const cheminFichier = (entrepriseId: string, table: string, id: string, champ: string) =>
  `${entrepriseId}/${table}/${id}/${champ}`
