import { useSyncExternalStore } from 'react'
import { actualiserCompte, etatCompte, messageErreur, suivreCompte } from './compte'
import { nombreEnAttente, synchroniser } from './moteur'
import { surEcriture } from './suivi'
import { serveurSupabase, supabase } from './supabase'

export interface EtatSynchro {
  enAttente: number
  enCours: boolean
  horsLigne: boolean
  erreur?: string
  /** Augmente quand des modifications arrivent du serveur : les écrans se rechargent. */
  versionRecue: number
}

/** Envoi peu après une modification, et un passage régulier pour recevoir celles des collègues. */
const DELAI_APRES_MODIF_MS = 3_000
const INTERVALLE_MS = 2 * 60_000

let etat: EtatSynchro = { enAttente: 0, enCours: false, horsLigne: !navigator.onLine, versionRecue: 0 }
const ecouteurs = new Set<() => void>()

function changer(modif: Partial<EtatSynchro>) {
  etat = { ...etat, ...modif }
  ecouteurs.forEach((f) => f())
}

export function useSynchro(): EtatSynchro {
  return useSyncExternalStore(
    (f) => {
      ecouteurs.add(f)
      return () => ecouteurs.delete(f)
    },
    () => etat,
  )
}

async function compterEnAttente() {
  changer({ enAttente: await nombreEnAttente() })
}

let enCours: Promise<void> | undefined
let encore = false

/** Lance un passage (ou en programme un autre juste après celui en cours). */
export function synchroniserMaintenant(): Promise<void> {
  if (enCours) {
    encore = true
    return enCours
  }
  enCours = passage().finally(() => {
    enCours = undefined
    if (encore) {
      encore = false
      void synchroniserMaintenant()
    }
  })
  return enCours
}

async function passage() {
  const compte = etatCompte()
  const c = supabase()
  if (compte.statut !== 'connecte' || !c) return
  if (!navigator.onLine) {
    changer({ horsLigne: true })
    return
  }
  changer({ enCours: true, horsLigne: false })
  try {
    const { recus, refuses } = await synchroniser(serveurSupabase(c), compte.membre.entrepriseId)
    changer({
      erreur: refuses
        ? `${refuses} élément${refuses > 1 ? 's' : ''} déjà enregistré${refuses > 1 ? 's' : ''} dans une autre entreprise, gardé${refuses > 1 ? 's' : ''} sur cet appareil seulement`
        : undefined,
      ...(recus ? { versionRecue: etat.versionRecue + 1 } : {}),
    })
  } catch (e) {
    changer({ erreur: messageErreur(e) })
  } finally {
    changer({ enCours: false })
    await compterEnAttente()
  }
}

let minuteur: ReturnType<typeof setTimeout> | undefined

function programmer(delai: number) {
  clearTimeout(minuteur)
  minuteur = setTimeout(() => void synchroniserMaintenant(), delai)
}

let demarre = false

/** À appeler une fois au lancement de l'appli. */
export function demarrerSynchro(): void {
  if (demarre) return
  demarre = true
  void compterEnAttente()

  surEcriture(async () => {
    await compterEnAttente()
    if (etat.enAttente && etatCompte().statut === 'connecte') programmer(DELAI_APRES_MODIF_MS)
  })
  suivreCompte(() => {
    if (etatCompte().statut === 'connecte') void synchroniserMaintenant()
  })
  window.addEventListener('online', () => {
    changer({ horsLigne: false })
    void synchroniserMaintenant()
  })
  window.addEventListener('offline', () => changer({ horsLigne: true }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      actualiserCompte()
      void synchroniserMaintenant()
    }
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') void synchroniserMaintenant()
  }, INTERVALLE_MS)
  void synchroniserMaintenant()
}
