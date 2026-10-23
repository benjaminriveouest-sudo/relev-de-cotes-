import type { DBCore, DBCoreMutateRequest, DBCoreTable, DBCoreTransaction, Middleware } from 'dexie'

/** Tables envoyées au serveur (toutes celles du relevé). */
export const TABLES_SYNCHRO = [
  'chantiers',
  'ouvrages',
  'photos',
  'cotes',
  'reperes',
  'croquis',
  'traits',
  'notes',
  'notesVocales',
] as const

export type TableSynchro = (typeof TABLES_SYNCHRO)[number]

/** Élément de la file d'envoi : dernière opération connue pour un objet. */
export interface Envoi {
  /** « table:id », une seule entrée par objet. */
  cle: string
  table: TableSynchro
  id: string
  op: 'put' | 'delete'
  /** Change à chaque modification : l'envoi n'efface l'entrée que si personne ne l'a modifiée entre-temps. */
  jeton: string
  /** Date de l'opération (ms). */
  at: number
}

export const TABLE_ENVOIS = 'envois'

const suivies = new Set<string>(TABLES_SYNCHRO)
let compteur = 0
const ecouteurs = new Set<() => void>()

/** Appelé après chaque transaction qui a écrit dans le relevé (pour lancer l'envoi). */
export function surEcriture(f: () => void): () => void {
  ecouteurs.add(f)
  return () => ecouteurs.delete(f)
}

const apresEcriture = () => ecouteurs.forEach((f) => f())

export const cleEnvoi = (table: string, id: string) => `${table}:${id}`

export function nouvelEnvoi(table: TableSynchro, id: string, op: Envoi['op']): Envoi {
  const at = Date.now()
  return { cle: cleEnvoi(table, id), table, id, op, jeton: `${at}-${++compteur}`, at }
}

/**
 * Note chaque écriture des tables du relevé dans la file d'envoi, dans la même transaction :
 * si le téléphone s'éteint, la modification et son envoi à faire sont enregistrés ensemble ou pas du tout.
 */
export function suiviModifications(): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'suivi-modifications',
    create(down) {
      // Pendant une mise à jour de la base depuis une ancienne version, la file n'existe pas encore.
      const avecFile = down.schema.tables.some((t) => t.name === TABLE_ENVOIS)
      if (!avecFile) return down
      return {
        ...down,
        transaction(stores, mode, options) {
          const suivie = mode === 'readwrite' && stores.some((s) => suivies.has(s))
          const trans = down.transaction(
            suivie && !stores.includes(TABLE_ENVOIS) ? [...stores, TABLE_ENVOIS] : stores,
            mode,
            options,
          )
          if (suivie) (trans as unknown as IDBTransaction).addEventListener?.('complete', apresEcriture)
          return trans
        },
        table(nom) {
          const table = down.table(nom)
          if (!suivies.has(nom)) return table
          const envois = down.table(TABLE_ENVOIS)
          return {
            ...table,
            async mutate(req) {
              const avant = req.type === 'deleteRange' ? await clesDansPlage(table, req.trans, req) : undefined
              const res = await table.mutate(req)
              const notes = operations(nom as TableSynchro, req, avant).filter((_, i) => !res.failures[i])
              if (notes.length) await envois.mutate({ type: 'put', trans: req.trans, values: notes })
              return res
            },
          }
        },
      }
    },
  }
}

async function clesDansPlage(table: DBCoreTable, trans: DBCoreTransaction, req: DBCoreMutateRequest & { type: 'deleteRange' }) {
  const res = await table.query({ trans, values: false, query: { index: table.schema.primaryKey, range: req.range } })
  return res.result as string[]
}

function operations(table: TableSynchro, req: DBCoreMutateRequest, clesSupprimees?: string[]): Envoi[] {
  switch (req.type) {
    case 'add':
    case 'put':
      return req.values.map((v: { id: string }) => nouvelEnvoi(table, v.id, 'put'))
    case 'delete':
      return req.keys.map((id: string) => nouvelEnvoi(table, id, 'delete'))
    case 'deleteRange':
      return (clesSupprimees ?? []).map((id) => nouvelEnvoi(table, id, 'delete'))
  }
}
