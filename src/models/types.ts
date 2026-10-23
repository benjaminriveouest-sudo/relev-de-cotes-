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
  /** Photo ou croquis qui porte la cote. */
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
  /** Photo ou croquis qui porte le repère. */
  photoId: string
  position: Point
  texte: string
  updatedAt: number
}

/** Feuille quadrillée : les coordonnées sont en unités de feuille, comme les pixels d'une photo. */
export interface Croquis {
  id: string
  ouvrageId: string
  largeur: number
  hauteur: number
  /** Côté d'un carreau, en unités de feuille. */
  pas: number
  createdAt: number
  updatedAt: number
}

/** Trait dessiné sur un croquis : ligne droite (2 points) ou tracé à main levée. */
export interface Trait {
  id: string
  croquisId: string
  /** Points à plat : x1, y1, x2, y2… */
  points: number[]
  updatedAt: number
}

/** Calque d'annotations d'une photo ou d'un croquis (les traits n'existent que sur un croquis). */
export interface Annotations {
  cotes: Cote[]
  reperes: Repere[]
  traits: Trait[]
}

/** Note écrite et cases cochées d'un ouvrage (une seule par ouvrage). */
export interface Note {
  id: string
  ouvrageId: string
  texte: string
  /** Identifiants des cases cochées (voir CASES_A_COCHER). */
  cases: string[]
  updatedAt: number
}

export const CASES_A_COCHER: { groupe: string; cases: { id: string; libelle: string }[] }[] = [
  {
    groupe: 'Support',
    cases: [
      { id: 'support.beton', libelle: 'Béton' },
      { id: 'support.acier', libelle: 'Acier' },
      { id: 'support.bois', libelle: 'Bois' },
      { id: 'support.maconnerie', libelle: 'Maçonnerie' },
    ],
  },
  {
    groupe: 'Accès',
    cases: [
      { id: 'acces.facile', libelle: 'Facile' },
      { id: 'acces.nacelle', libelle: 'Nacelle' },
      { id: 'acces.echafaudage', libelle: 'Échafaudage' },
    ],
  },
  {
    groupe: 'Contraintes',
    cases: [
      { id: 'contrainte.hauteur', libelle: 'Travail en hauteur' },
      { id: 'contrainte.horaires', libelle: 'Horaires imposés' },
      { id: 'contrainte.a_confirmer', libelle: 'À confirmer' },
    ],
  },
]

export interface NoteVocale {
  id: string
  ouvrageId: string
  audio: Blob
  dureeMs: number
  createdAt: number
  updatedAt: number
}
