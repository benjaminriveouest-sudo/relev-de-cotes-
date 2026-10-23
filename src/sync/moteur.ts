import { db } from '../db/db'
import { cleEnvoi, nouvelEnvoi, TABLES_SYNCHRO, type Envoi, type TableSynchro } from './suivi'
import { cheminFichier, type Ligne, type LigneLue, type Serveur } from './serveur'

/** Champs fichiers de chaque table, pour les effacer du stockage quand l'objet est supprimé. */
const CHAMPS_FICHIERS: Partial<Record<TableSynchro, string[]>> = {
  photos: ['blob', 'thumb'],
  notesVocales: ['audio'],
}

/** Combien de lignes par aller-retour avec le serveur. */
const PAQUET_ENVOI = 25
const PAQUET_LECTURE = 200
/** Relecture d'un peu avant le dernier passage, pour ne rien rater d'une écriture lente côté serveur. */
const MARGE_LECTURE_MS = 30_000

type Objet = Record<string, unknown> & { id: string; updatedAt?: number }
interface Empreinte {
  taille: number
  type: string
}

const tableLocale = (nom: TableSynchro) => db.table<Objet, string>(nom)
const estTableSynchro = (nom: string): nom is TableSynchro => (TABLES_SYNCHRO as readonly string[]).includes(nom)
const cleFichier = (table: string, id: string, champ: string) => `fichier:${table}:${id}:${champ}`
const empreinte = (b: Blob) => `${b.size}:${b.type}`

async function lireMeta<T>(cle: string): Promise<T | undefined> {
  return (await db.meta.get(cle))?.valeur as T | undefined
}

/** Nombre de modifications pas encore envoyées. */
export function nombreEnAttente(): Promise<number> {
  return db.envois.count()
}

/**
 * Première connexion du téléphone à cette entreprise : tout ce qui est déjà sur le téléphone
 * part dans la file d'envoi, et on relit tout le serveur.
 */
export async function preparerEntreprise(entrepriseId: string): Promise<void> {
  if ((await lireMeta<string>('entreprise')) === entrepriseId) return
  await db.transaction('rw', [db.envois, db.meta, ...TABLES_SYNCHRO.map(tableLocale)], async () => {
    const envois: Envoi[] = []
    for (const table of TABLES_SYNCHRO) {
      for (const id of await tableLocale(table).toCollection().primaryKeys()) envois.push(nouvelEnvoi(table, id, 'put'))
    }
    await db.envois.bulkPut(envois)
    await db.meta.bulkDelete(['curseur'])
    await db.meta.put({ cle: 'entreprise', valeur: entrepriseId })
  })
}

/** Sépare un objet du téléphone en données (pour la base) et fichiers (pour le stockage). */
function versServeur(objet: Objet): { data: Record<string, unknown>; fichiers: Record<string, Blob> } {
  const data: Record<string, unknown> = {}
  const fichiers: Record<string, Blob> = {}
  const empreintes: Record<string, Empreinte> = {}
  for (const [champ, valeur] of Object.entries(objet)) {
    if (valeur instanceof Blob) {
      fichiers[champ] = valeur
      empreintes[champ] = { taille: valeur.size, type: valeur.type }
    } else {
      data[champ] = valeur
    }
  }
  if (Object.keys(empreintes).length) data._fichiers = empreintes
  return { data, fichiers }
}

/** Envoie la file d'attente au serveur. Renvoie le nombre de modifications envoyées. */
export async function envoyer(serveur: Serveur, entrepriseId: string): Promise<number> {
  const file = await db.envois.toArray()
  let envoyes = 0
  for (let i = 0; i < file.length; i += PAQUET_ENVOI) {
    const paquet = file.slice(i, i + PAQUET_ENVOI)
    const lignes: Ligne[] = []
    const aEffacer: string[] = []
    for (const e of paquet) {
      const objet = e.op === 'put' ? await tableLocale(e.table).get(e.id) : undefined
      const ligne = { id: e.id, entreprise_id: entrepriseId, table_name: e.table }
      if (!objet) {
        lignes.push({ ...ligne, data: {}, updated_at: e.at, deleted: true })
        for (const champ of CHAMPS_FICHIERS[e.table] ?? []) aEffacer.push(cheminFichier(entrepriseId, e.table, e.id, champ))
        continue
      }
      const { data, fichiers } = versServeur(objet)
      // Les fichiers d'abord : une ligne présente sur le serveur a toujours ses fichiers.
      for (const [champ, fichier] of Object.entries(fichiers)) {
        const cle = cleFichier(e.table, e.id, champ)
        if ((await lireMeta<string>(cle)) === empreinte(fichier)) continue
        await serveur.deposerFichier(cheminFichier(entrepriseId, e.table, e.id, champ), fichier)
        await db.meta.put({ cle, valeur: empreinte(fichier) })
      }
      lignes.push({ ...ligne, data, updated_at: objet.updatedAt ?? e.at, deleted: false })
    }
    await serveur.envoyer(lignes)
    if (aEffacer.length) await serveur.supprimerFichiers(aEffacer).catch(() => undefined)
    // Une entrée modifiée pendant l'envoi reste dans la file pour le prochain passage.
    await db.transaction('rw', db.envois, async () => {
      for (const e of paquet) {
        if ((await db.envois.get(e.cle))?.jeton === e.jeton) {
          await db.envois.delete(e.cle)
          envoyes++
        }
      }
    })
  }
  return envoyes
}

interface Recu {
  table: TableSynchro
  ligne: LigneLue
  /** Objet à écrire, ou null pour le supprimer. */
  objet: Objet | null
}

/** Prépare un objet reçu : télécharge ses fichiers, sauf s'ils sont déjà sur le téléphone. */
async function versTelephone(serveur: Serveur, table: TableSynchro, ligne: LigneLue, local?: Objet): Promise<Objet> {
  const { _fichiers, ...data } = ligne.data as Record<string, unknown> & { _fichiers?: Record<string, Empreinte> }
  const objet = data as Objet
  for (const [champ, e] of Object.entries(_fichiers ?? {})) {
    const existant = local?.[champ]
    if (existant instanceof Blob && existant.size === e.taille && existant.type === e.type) {
      objet[champ] = existant
      continue
    }
    const telecharge = await serveur.telechargerFichier(cheminFichier(ligne.entreprise_id, table, ligne.id, champ))
    // Le stockage peut perdre le type : on garde celui d'origine (lecture audio sur iPhone).
    const fichier = e.type && telecharge.type !== e.type ? new Blob([telecharge], { type: e.type }) : telecharge
    objet[champ] = fichier
    await db.meta.put({ cle: cleFichier(table, ligne.id, champ), valeur: empreinte(fichier) })
  }
  return objet
}

/** Écrit sur le téléphone ce qui a changé sur le serveur. Renvoie le nombre d'objets modifiés. */
async function appliquer(serveur: Serveur, lignes: LigneLue[]): Promise<number> {
  const recus: Recu[] = []
  for (const ligne of lignes) {
    const table = ligne.table_name
    if (!estTableSynchro(table)) continue
    const local = await tableLocale(table).get(ligne.id)
    if (ligne.deleted) {
      if (local) recus.push({ table, ligne, objet: null })
    } else if (!local || local.updatedAt !== ligne.updated_at) {
      recus.push({ table, ligne, objet: await versTelephone(serveur, table, ligne, local) })
    }
  }
  if (!recus.length) return 0

  let modifies = 0
  await db.transaction('rw', [db.envois, ...TABLES_SYNCHRO.map(tableLocale)], async () => {
    for (const { table, ligne, objet } of recus) {
      const cle = cleEnvoi(table, ligne.id)
      const enAttente = await db.envois.get(cle)
      if (enAttente) {
        // Modification locale pas encore envoyée : la plus récente gagne.
        const local = enAttente.op === 'put' ? await tableLocale(table).get(ligne.id) : undefined
        const dateLocale = local?.updatedAt ?? enAttente.at
        if (dateLocale >= ligne.updated_at) continue
      }
      if (objet) await tableLocale(table).put(objet)
      else await tableLocale(table).delete(ligne.id)
      // L'écriture vient du serveur : rien à renvoyer.
      await db.envois.delete(cle)
      modifies++
    }
  })
  return modifies
}

/** Récupère ce qui a changé sur le serveur depuis le dernier passage. */
export async function recevoir(serveur: Serveur): Promise<number> {
  const curseur = await lireMeta<number>('curseur')
  const depuis = curseur !== undefined ? new Date(curseur - MARGE_LECTURE_MS).toISOString() : null
  let plusRecent = curseur ?? 0
  let modifies = 0
  for (let debut = 0; ; debut += PAQUET_LECTURE) {
    const lignes = await serveur.lire(depuis, debut, PAQUET_LECTURE)
    modifies += await appliquer(serveur, lignes)
    for (const l of lignes) plusRecent = Math.max(plusRecent, Date.parse(l.server_updated_at))
    if (lignes.length < PAQUET_LECTURE) break
  }
  if (plusRecent) await db.meta.put({ cle: 'curseur', valeur: plusRecent })
  return modifies
}

/** Un passage complet : envoi puis réception. */
export async function synchroniser(serveur: Serveur, entrepriseId: string): Promise<{ envoyes: number; recus: number }> {
  await preparerEntreprise(entrepriseId)
  const envoyes = await envoyer(serveur, entrepriseId)
  const recus = await recevoir(serveur)
  return { envoyes, recus }
}
