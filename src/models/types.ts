/** Point en pixels de l'image d'origine (indépendant du zoom et de l'écran). */
export interface Point {
  x: number
  y: number
}

export type StatutOuvrage = 'a_relever' | 'releve' | 'valide'

export const STATUTS: { valeur: StatutOuvrage; libelle: string }[] = [
  { valeur: 'a_relever', libelle: 'À relever' },
  { valeur: 'releve', libelle: 'Relevé' },
  { valeur: 'valide', libelle: 'Validé' },
]

export const TYPES_OUVRAGE = ['Garde-corps', 'Escalier', 'Portail', 'Menuiserie', 'Clôture', 'Autre']

export interface Chantier {
  id: string
  nom: string
  client: string
  adresse: string
  /** Contact sur place (nom, téléphone). */
  contact: string
  /** Date prévue du relevé, au format AAAA-MM-JJ. */
  date: string
  createdAt: number
  updatedAt: number
}

export interface Ouvrage {
  id: string
  chantierId: string
  type: string
  /** Repère du plan (« GC1 »). */
  repere: string
  /** Où il se trouve (« façade sud, R+1 »). */
  localisation: string
  statut: StatutOuvrage
  createdAt: number
  updatedAt: number
}

export interface Photo {
  id: string
  ouvrageId: string
  /** Image stockée (réduite à l'import, jamais annotée). */
  blob: Blob
  thumb: Blob
  width: number
  height: number
  createdAt: number
  updatedAt: number
}

export interface Cote {
  id: string
  photoId: string
  a: Point
  b: Point
  /** Valeur saisie en millimètres, null si pas encore saisie. */
  valeurMm: number | null
  libelle: string
  updatedAt: number
}

export interface Repere {
  id: string
  photoId: string
  position: Point
  texte: string
  updatedAt: number
}

/** Calque d'annotations d'une photo. */
export interface Annotations {
  cotes: Cote[]
  reperes: Repere[]
}
