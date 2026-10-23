import { useRef, useState } from 'react'
import type { PdfCree, Progres } from './exporter'
import { ecrireAuteur, fichierPdf, lireAuteur, partagePossible, partager, telecharger } from './partage'

interface Props {
  libelle: string
  creer: (auteur: string, progres: Progres) => Promise<PdfCree>
}

type Etape =
  | { nom: 'ferme' }
  | { nom: 'auteur' }
  | { nom: 'creation'; message: string }
  | { nom: 'pret'; fichier: File }
  | { nom: 'erreur'; message: string }

/**
 * Bouton d'export : demande le nom une seule fois, crée le PDF, puis propose de le partager.
 * Le partage est un second appui : l'iPhone n'ouvre son menu de partage que juste après un toucher.
 */
export function ExportPdf({ libelle, creer }: Props) {
  const [etape, setEtape] = useState<Etape>({ nom: 'ferme' })
  const [auteur, setAuteur] = useState(lireAuteur)
  const tour = useRef(0)

  async function lancer(nom: string) {
    const ce = ++tour.current
    setEtape({ nom: 'creation', message: 'Préparation…' })
    try {
      const { octets, nomFichier } = await creer(nom, (message) => tour.current === ce && setEtape({ nom: 'creation', message }))
      if (tour.current === ce) setEtape({ nom: 'pret', fichier: fichierPdf(octets, nomFichier) })
    } catch (e) {
      if (tour.current === ce) setEtape({ nom: 'erreur', message: `Création du PDF impossible (${e instanceof Error ? e.message : e}).` })
    }
  }

  function ouvrir() {
    if (auteur.trim()) lancer(auteur.trim())
    else setEtape({ nom: 'auteur' })
  }

  function fermer() {
    tour.current++
    setEtape({ nom: 'ferme' })
  }

  function validerAuteur(e: React.FormEvent) {
    e.preventDefault()
    const nom = auteur.trim()
    if (!nom) return
    ecrireAuteur(nom)
    setAuteur(nom)
    lancer(nom)
  }

  async function envoyer(fichier: File) {
    try {
      await partager(fichier)
    } catch (e) {
      setEtape({ nom: 'erreur', message: `Partage impossible (${e instanceof Error ? e.message : e}). Essayez « Télécharger ».` })
    }
  }

  return (
    <>
      <button className="btn btn-large" onClick={ouvrir}>
        {libelle}
      </button>

      {etape.nom !== 'ferme' && (
        <div className="modale-fond" onClick={etape.nom === 'creation' ? undefined : fermer}>
          <div className="modale formulaire" onClick={(e) => e.stopPropagation()}>
            {etape.nom === 'auteur' && (
              <form className="formulaire" onSubmit={validerAuteur}>
                <h2>Votre nom</h2>
                <label>
                  Il apparaît sur le PDF comme auteur du relevé. Il est gardé sur ce téléphone.
                  <input
                    className="champ"
                    value={auteur}
                    onChange={(e) => setAuteur(e.target.value)}
                    placeholder="Prénom Nom"
                    autoComplete="name"
                    autoFocus
                  />
                </label>
                <div className="modale-actions">
                  <button type="button" className="btn" onClick={fermer}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primaire" disabled={!auteur.trim()}>
                    Créer le PDF
                  </button>
                </div>
              </form>
            )}

            {etape.nom === 'creation' && (
              <>
                <h2>Création du PDF</h2>
                <p className="export-progres">{etape.message}</p>
                <button className="btn btn-large" onClick={fermer}>
                  Annuler
                </button>
              </>
            )}

            {etape.nom === 'pret' && (
              <>
                <h2>PDF prêt</h2>
                <p className="export-fichier">{etape.fichier.name}</p>
                <p className="export-auteur">
                  Auteur : <strong>{auteur}</strong>{' '}
                  <button className="lien" onClick={() => setEtape({ nom: 'auteur' })}>
                    changer
                  </button>
                </p>
                {partagePossible(etape.fichier) && (
                  <button className="btn btn-primaire btn-large" onClick={() => envoyer(etape.fichier)}>
                    Partager (Mail, WhatsApp, Fichiers…)
                  </button>
                )}
                <button className="btn btn-large" onClick={() => telecharger(etape.fichier)}>
                  Télécharger
                </button>
                <button className="btn btn-large" onClick={fermer}>
                  Fermer
                </button>
              </>
            )}

            {etape.nom === 'erreur' && (
              <>
                <h2>Export PDF</h2>
                <p className="erreur">{etape.message}</p>
                <button className="btn btn-large" onClick={fermer}>
                  Fermer
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
