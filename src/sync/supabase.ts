import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_CLE_PUBLIQUE, SUPABASE_URL, synchroConfiguree } from './config'
import type { LigneLue, Serveur } from './serveur'

let client: SupabaseClient | undefined

/** Client Supabase, ou undefined si la synchronisation n'est pas configurée. */
export function supabase(): SupabaseClient | undefined {
  if (!synchroConfiguree()) return undefined
  client ??= createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'releve-de-cotes-auth' },
  })
  return client
}

const BUCKET = 'fichiers'

/** Erreur du serveur, précédée de l'étape qui a échoué pour savoir où chercher. */
function verifier<T>({ data, error }: { data: T; error: { message: string } | null }, etape: string): T {
  if (error) throw new Error(`${etape} : ${error.message}`)
  return data
}

export function serveurSupabase(c: SupabaseClient): Serveur {
  return {
    async envoyer(lignes) {
      verifier(await c.from('elements').upsert(lignes, { onConflict: 'id' }), 'Envoi des relevés')
    },
    async lire(depuis, debut, nombre) {
      let requete = c
        .from('elements')
        .select('id, entreprise_id, table_name, data, updated_at, deleted, server_updated_at')
        .order('server_updated_at')
        .order('id')
        .range(debut, debut + nombre - 1)
      if (depuis) requete = requete.gt('server_updated_at', depuis)
      return verifier(await requete, 'Lecture des relevés') as LigneLue[]
    },
    async deposerFichier(chemin, fichier) {
      verifier(
        await c.storage
          .from(BUCKET)
          .upload(chemin, fichier, { upsert: true, contentType: fichier.type || 'application/octet-stream' }),
        'Envoi des photos et sons',
      )
    },
    async telechargerFichier(chemin) {
      const fichier = verifier(await c.storage.from(BUCKET).download(chemin), 'Téléchargement des photos et sons')
      if (!fichier) throw new Error(`Fichier introuvable : ${chemin}`)
      return fichier
    },
    async supprimerFichiers(chemins) {
      verifier(await c.storage.from(BUCKET).remove(chemins), 'Suppression de fichiers')
    },
  }
}
