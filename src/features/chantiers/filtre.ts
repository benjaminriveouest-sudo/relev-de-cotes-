import type { ChantierResume } from '../../db/db'
import type { StatutOuvrage } from '../../models/types'

/** Minuscules et sans accents : « Façade » se trouve en tapant « facade ». */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Garde les chantiers dont le nom, le client ou l'adresse contient tous les mots tapés,
 * et, si un statut est choisi, qui ont au moins un ouvrage dans ce statut.
 */
export function filtrerChantiers(
  liste: ChantierResume[],
  recherche: string,
  statut: StatutOuvrage | null,
): ChantierResume[] {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean)
  return liste.filter(({ chantier, statuts }) => {
    if (statut && statuts[statut] === 0) return false
    const texte = normaliser(`${chantier.nom} ${chantier.client} ${chantier.adresse}`)
    return mots.every((m) => texte.includes(m))
  })
}
