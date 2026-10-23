/** Point en pixels de l'image d'origine (indépendant du zoom et de l'écran). */
export interface Point {
  x: number
  y: number
}

export interface Photo {
  id: string
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
