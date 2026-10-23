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

function verifier<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data
}

export function serveurSupabase(c: SupabaseClient): Serveur {
  return {
    async envoyer(lignes) {
      verifier(await c.from('elements').upsert(lignes, { onConflict: 'id' }))
    },
    async lire(depuis, debut, nombre) {
      let requete = c
        .from('elements')
        .select('id, entreprise_id, table_name, data, updated_at, deleted, server_updated_at')
        .order('server_updated_at')
        .order('id')
        .range(debut, debut + nombre - 1)
      if (depuis) requete = requete.gt('server_updated_at', depuis)
      return verifier(await requete) as LigneLue[]
    },
    async deposerFichier(chemin, fichier) {
      verifier(
        await c.storage
          .from(BUCKET)
          .upload(chemin, fichier, { upsert: true, contentType: fichier.type || 'application/octet-stream' }),
      )
    },
    async telechargerFichier(chemin) {
      const fichier = verifier(await c.storage.from(BUCKET).download(chemin))
      if (!fichier) throw new Error(`Fichier introuvable : ${chemin}`)
      return fichier
    },
    async supprimerFichiers(chemins) {
      verifier(await c.storage.from(BUCKET).remove(chemins))
    },
  }
}
