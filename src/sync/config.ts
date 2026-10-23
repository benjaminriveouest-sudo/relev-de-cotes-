/**
 * Adresse du projet Supabase et sa clé publique (« publishable » ou « anon »).
 * Cette clé est faite pour être publique : sans compte, elle ne donne accès à rien (règles d'accès de supabase/schema.sql).
 * Ne jamais mettre ici la clé « secret » ou « service_role ».
 * Laissées vides, l'appli fonctionne sans compte, uniquement sur le téléphone.
 */
export const SUPABASE_URL = 'https://cgzmftpglyitnbzormra.supabase.co'
export const SUPABASE_CLE_PUBLIQUE = 'sb_publishable_TAvQKQK8TMZ76DPaVlMhZg_i_Hs5eX9'

export const synchroConfiguree = () => Boolean(SUPABASE_URL && SUPABASE_CLE_PUBLIQUE)
