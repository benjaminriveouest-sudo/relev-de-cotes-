import { useSyncExternalStore } from 'react'
import { ecrireAuteur } from '../features/export/partage'
import { synchroConfiguree } from './config'
import { supabase } from './supabase'

export type Role = 'terrain' | 'bureau'

export interface Membre {
  userId: string
  nom: string
  email: string
  role: Role
  entrepriseId: string
  entrepriseNom: string
}

export type EtatCompte =
  | { statut: 'non_configure' }
  | { statut: 'chargement' }
  | { statut: 'deconnecte' }
  | { statut: 'sans_entreprise'; email: string }
  | { statut: 'connecte'; membre: Membre }

/** Membre gardé sur le téléphone : l'appli sait qui est connecté même sans réseau. */
const CLE_MEMBRE = 'compte'

function lireMembreGarde(): Membre | undefined {
  try {
    const texte = localStorage.getItem(CLE_MEMBRE)
    return texte ? (JSON.parse(texte) as Membre) : undefined
  } catch {
    return undefined
  }
}

function garderMembre(membre: Membre | undefined) {
  try {
    if (membre) localStorage.setItem(CLE_MEMBRE, JSON.stringify(membre))
    else localStorage.removeItem(CLE_MEMBRE)
  } catch {
    // Stockage refusé : il faudra du réseau pour retrouver le compte au prochain lancement.
  }
}

function etatInitial(): EtatCompte {
  if (!synchroConfiguree()) return { statut: 'non_configure' }
  const membre = lireMembreGarde()
  return membre ? { statut: 'connecte', membre } : { statut: 'chargement' }
}

let etat: EtatCompte = etatInitial()
const ecouteurs = new Set<() => void>()

function changer(nouveau: EtatCompte) {
  etat = nouveau
  garderMembre(nouveau.statut === 'connecte' ? nouveau.membre : undefined)
  ecouteurs.forEach((f) => f())
}

export function etatCompte(): EtatCompte {
  return etat
}

export function suivreCompte(f: () => void): () => void {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

export function useCompte(): EtatCompte {
  return useSyncExternalStore(suivreCompte, etatCompte)
}

/** Sans compte, tout le monde peut tout faire ; connecté, seul le bureau valide. */
export function peutValider(e: EtatCompte = etat): boolean {
  return e.statut !== 'connecte' || e.membre.role === 'bureau'
}

function client() {
  const c = supabase()
  if (!c) throw new Error("La synchronisation n'est pas configurée")
  return c
}

/** Traduit les messages de Supabase pour l'écran. */
export function messageErreur(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.'
  if (/already registered|already exists/i.test(m)) return 'Ce compte existe déjà : utilisez « Se connecter ».'
  if (/password should be at least/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères.'
  if (/email not confirmed/i.test(m)) return "L'adresse e-mail n'est pas encore confirmée."
  if (/invalid.*email|unable to validate email/i.test(m)) return 'Adresse e-mail invalide.'
  if (/failed to fetch|network|load failed/i.test(m)) return `Serveur injoignable : pas de réseau, ou Supabase ne répond pas (détail : ${m}).`
  return m
}

/** Relit le membre sur le serveur. Sans réseau, on garde ce qu'on sait. */
async function chargerMembre(): Promise<void> {
  const c = client()
  const { data: session, error: erreurSession } = await c.auth.getSession()
  // Session expirée et pas de réseau pour la renouveler : on reste comme on était.
  if (erreurSession) throw new Error(erreurSession.message)
  const user = session.session?.user
  if (!user) {
    changer({ statut: 'deconnecte' })
    return
  }
  const { data, error } = await c
    .from('membres')
    .select('user_id, nom, email, role, entreprise_id, entreprises(nom)')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) {
    changer({ statut: 'sans_entreprise', email: user.email ?? '' })
    return
  }
  const entreprise = data.entreprises as unknown as { nom: string } | null
  changer({
    statut: 'connecte',
    membre: {
      userId: data.user_id,
      nom: data.nom,
      email: data.email,
      role: data.role as Role,
      entrepriseId: data.entreprise_id,
      entrepriseNom: entreprise?.nom ?? '',
    },
  })
}

let demarre = false

/** Au lancement : reprend la session gardée et suit les connexions / déconnexions. */
export function demarrerCompte(): void {
  const c = supabase()
  if (!c || demarre) return
  demarre = true
  c.auth.onAuthStateChange((evenement) => {
    if (evenement === 'SIGNED_OUT') changer({ statut: 'deconnecte' })
  })
  actualiserCompte()
}

/** Relit le compte (rôle changé par le bureau, membre retiré…), sans effet hors ligne. */
export function actualiserCompte(): void {
  chargerMembre().catch(() => {
    if (etat.statut === 'chargement') changer({ statut: 'deconnecte' })
  })
}

export async function connexion(email: string, motDePasse: string): Promise<void> {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password: motDePasse })
  if (error) throw new Error(error.message)
  await chargerMembre()
}

/** Crée le compte. Renvoie false si Supabase attend une confirmation par e-mail. */
export async function inscription(email: string, motDePasse: string): Promise<boolean> {
  const { data, error } = await client().auth.signUp({ email: email.trim(), password: motDePasse })
  if (error) throw new Error(error.message)
  if (!data.session) return false
  await chargerMembre()
  return true
}

export async function deconnexion(): Promise<void> {
  // Sans réseau, la session est quand même oubliée sur ce téléphone.
  await client()
    .auth.signOut({ scope: 'local' })
    .catch(() => undefined)
  changer({ statut: 'deconnecte' })
}

async function rpc<T>(nom: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(nom, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function creerEntreprise(nomEntreprise: string, nom: string): Promise<void> {
  await rpc('creer_entreprise', { nom_entreprise: nomEntreprise.trim(), nom_membre: nom.trim() })
  ecrireAuteur(nom.trim())
  await chargerMembre()
}

export async function rejoindreEntreprise(code: string, nom: string): Promise<void> {
  await rpc('rejoindre_entreprise', { code, nom_membre: nom.trim() })
  ecrireAuteur(nom.trim())
  await chargerMembre()
}

export interface MembreListe {
  user_id: string
  nom: string
  email: string
  role: Role
}

export async function listerMembres(): Promise<MembreListe[]> {
  const { data, error } = await client().from('membres').select('user_id, nom, email, role').order('nom')
  if (error) throw new Error(error.message)
  return data as MembreListe[]
}

export const codeInvitation = () => rpc<string>('code_invitation')
export const nouveauCodeInvitation = () => rpc<string>('nouveau_code_invitation')
export const changerRole = (userId: string, role: Role) => rpc<void>('changer_role', { membre: userId, nouveau_role: role })
export const retirerMembre = (userId: string) => rpc<void>('retirer_membre', { membre: userId })
