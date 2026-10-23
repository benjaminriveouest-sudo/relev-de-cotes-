import { STATUTS, type StatutOuvrage } from '../../models/types'

function libelleStatut(statut: StatutOuvrage): string {
  return STATUTS.find((s) => s.valeur === statut)?.libelle ?? statut
}

/** Pastille de couleur : gris à relever, jaune relevé, vert validé. */
export function Statut({ statut, nombre }: { statut: StatutOuvrage; nombre?: number }) {
  return (
    <span className={`statut statut-${statut}`}>
      {nombre !== undefined && `${nombre} `}
      {libelleStatut(statut).toLowerCase()}
    </span>
  )
}
