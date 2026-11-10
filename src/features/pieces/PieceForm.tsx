import { useState } from 'react'
import { deletePiece, savePiece } from '../../db/db'
import { newId } from '../../models/id'
import type { MurPiece, Piece } from '../../models/types'
import { CroquisPiece } from './CroquisPiece'
import { angleParDiagonale, contourMurs, encombrement, TOLERANCE_FERMETURE_MM } from './forme'
import { controlerPiece, lireCote } from './fusion'

interface Props {
  chantierId: string
  /** Absente : création d'une nouvelle pièce. */
  piece?: Piece
  onAnnuler: () => void
  onEnregistre: (piece: Piece) => void
  onSupprime?: () => void
}

/** Un mur en cours de saisie : les cases gardent le texte tapé. */
interface MurSaisi {
  longueur: string
  angle: string
  diagonale: string
}

const enTexte = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))
const murVide = (): MurSaisi => ({ longueur: '', angle: '90', diagonale: '' })
const quatreMurs = () => [murVide(), murVide(), murVide(), murVide()]
/** Hors du composant : l'heure n'est lue qu'au moment d'enregistrer, jamais pendant l'affichage. */
const maintenant = () => Date.now()

function versSaisie(murs: MurPiece[] | undefined): MurSaisi[] {
  if (!murs?.length) return quatreMurs()
  return murs.map((m) => ({ longueur: enTexte(m.longueurMm), angle: enTexte(m.angleDeg), diagonale: enTexte(m.diagonaleMm) }))
}

/**
 * Murs lus dans les cases. Au coin entre un mur et le suivant, une diagonale saisie donne l'angle (loi des
 * cosinus) ; sinon c'est l'angle tapé, 90° par défaut. Le dernier coin n'a pas d'angle : c'est le retour au départ.
 */
function lireMurs(saisie: MurSaisi[]): { murs: MurPiece[]; diagonalesFausses: number[] } {
  const longueurs = saisie.map((m) => lireCote(m.longueur))
  const diagonalesFausses: number[] = []
  const murs = saisie.map((m, i): MurPiece => {
    const dernier = i === saisie.length - 1
    const diagonale = dernier ? null : lireCote(m.diagonale)
    let angle = lireCote(m.angle) ?? 90
    const a = longueurs[i]
    const b = longueurs[i + 1]
    if (diagonale != null && a != null && b != null) {
      const parDiagonale = angleParDiagonale(a, b, diagonale)
      if (parDiagonale == null) diagonalesFausses.push(i + 1)
      else angle = parDiagonale
    }
    return { longueurMm: longueurs[i], angleDeg: angle, diagonaleMm: diagonale }
  })
  return { murs, diagonalesFausses }
}

export function PieceForm({ chantierId, piece, onAnnuler, onEnregistre, onSupprime }: Props) {
  const [forme, setForme] = useState<'rectangle' | 'murs'>(piece?.forme ?? 'rectangle')
  const [nom, setNom] = useState(piece?.nom ?? '')
  const [largeur, setLargeur] = useState(enTexte(piece?.forme === 'murs' ? null : piece?.largeurMm))
  const [profondeur, setProfondeur] = useState(enTexte(piece?.forme === 'murs' ? null : piece?.profondeurMm))
  const [hauteur, setHauteur] = useState(enTexte(piece?.hauteurMm))
  const [saisie, setSaisie] = useState<MurSaisi[]>(() => versSaisie(piece?.murs))
  const [remarque, setRemarque] = useState(piece?.remarque ?? '')
  const [erreur, setErreur] = useState<string>()

  const { murs, diagonalesFausses } = lireMurs(saisie)
  const contour = forme === 'murs' ? contourMurs(murs) : null
  const hors = contour ? encombrement(contour.points) : null

  // Cotes de la pièce telles qu'elles seront enregistrées (sans identifiant ni date : sert aussi au contrôle).
  const cotes = {
    forme,
    murs: forme === 'murs' ? murs : undefined,
    largeurMm: forme === 'murs' ? (hors?.largeurMm ?? null) : lireCote(largeur),
    profondeurMm: forme === 'murs' ? (hors?.profondeurMm ?? null) : lireCote(profondeur),
    hauteurMm: lireCote(hauteur),
  }
  // Les soucis sont signalés mais n'empêchent pas d'enregistrer : on peut relever la pièce en plusieurs fois.
  const soucis = controlerPiece(cotes)

  const modifierMur = (i: number, champ: keyof MurSaisi, valeur: string) =>
    setSaisie(saisie.map((m, k) => (k === i ? { ...m, [champ]: valeur } : m)))

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    const now = maintenant()
    const propre: Piece = {
      id: piece?.id ?? newId(),
      chantierId,
      nom: nom.trim() || 'Pièce',
      ...cotes,
      remarque: remarque.trim(),
      createdAt: piece?.createdAt ?? now,
      updatedAt: now,
    }
    try {
      await savePiece(propre)
      onEnregistre(propre)
    } catch (err) {
      setErreur(`Enregistrement impossible (${err instanceof Error ? err.message : err}).`)
    }
  }

  async function supprimer() {
    if (!piece) return
    if (!window.confirm('Supprimer cette pièce relevée ?')) return
    await deletePiece(piece.id)
    onSupprime?.()
  }

  const complet = forme === 'murs' && contour != null && murs.length >= 3
  const ferme = complet && contour.ecartMm <= TOLERANCE_FERMETURE_MM

  return (
    <div className="modale-fond" onClick={onAnnuler}>
      <form className="modale formulaire" onClick={(e) => e.stopPropagation()} onSubmit={enregistrer}>
        <h2>{piece ? 'Modifier la pièce' : 'Nouvelle pièce'}</h2>
        <label>
          Nom
          <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Boutique, cuisine, réserve…" />
        </label>
        <div className="puces">
          <button type="button" className={`puce ${forme === 'rectangle' ? 'active' : ''}`} onClick={() => setForme('rectangle')}>
            Rectangle
          </button>
          <button type="button" className={`puce ${forme === 'murs' ? 'active' : ''}`} onClick={() => setForme('murs')}>
            Mur par mur
          </button>
        </div>

        {forme === 'rectangle' ? (
          <>
            <label>
              Largeur (mm)
              <input className="champ" inputMode="decimal" value={largeur} onChange={(e) => setLargeur(e.target.value)} placeholder="3600" />
            </label>
            <label>
              Profondeur (mm)
              <input
                className="champ"
                inputMode="decimal"
                value={profondeur}
                onChange={(e) => setProfondeur(e.target.value)}
                placeholder="3000"
              />
            </label>
          </>
        ) : (
          <>
            <p className="mur-note">
              Faites le tour de la pièce, toujours dans le même sens. À chaque coin : l'angle (90° par défaut), ou la diagonale
              qui joint le début du mur au bout du mur suivant — l'angle est alors calculé.
            </p>
            <CroquisPiece murs={murs} />
            {complet && (
              <p className={`mur-note ${ferme ? 'fermeture-ok' : 'erreur'}`}>
                {ferme
                  ? `La pièce se referme (écart ${Math.round(contour.ecartMm)} mm).`
                  : `La pièce ne se referme pas : il manque ${Math.round(contour.ecartMm)} mm.`}
              </p>
            )}
            <div className="murs">
              {saisie.map((m, i) => {
                const dernier = i === saisie.length - 1
                const calcule = !dernier && lireCote(m.diagonale) != null && !diagonalesFausses.includes(i + 1)
                return (
                  <div className="mur" key={i}>
                    <div className="mur-titre">
                      <span>Mur {i + 1}</span>
                      {saisie.length > 3 && (
                        <button type="button" className="btn" onClick={() => setSaisie(saisie.filter((_, k) => k !== i))}>
                          Retirer
                        </button>
                      )}
                    </div>
                    <div className="mur-champs">
                      <label className="large">
                        Longueur (mm)
                        <input
                          className="champ"
                          inputMode="decimal"
                          value={m.longueur}
                          onChange={(e) => modifierMur(i, 'longueur', e.target.value)}
                          placeholder="3600"
                        />
                      </label>
                      {!dernier && (
                        <>
                          <label>
                            Angle du coin (°)
                            <input
                              className="champ"
                              inputMode="decimal"
                              value={calcule ? enTexte(murs[i].angleDeg) : m.angle}
                              onChange={(e) => modifierMur(i, 'angle', e.target.value)}
                              disabled={calcule}
                              placeholder="90"
                            />
                          </label>
                          <label>
                            ou diagonale (mm)
                            <input
                              className="champ"
                              inputMode="decimal"
                              value={m.diagonale}
                              onChange={(e) => modifierMur(i, 'diagonale', e.target.value)}
                              placeholder="facultatif"
                            />
                          </label>
                        </>
                      )}
                    </div>
                    {diagonalesFausses.includes(i + 1) && (
                      <p className="mur-note erreur">
                        Cette diagonale ne va pas avec les murs {i + 1} et {i + 2} : vérifiez les trois cotes.
                      </p>
                    )}
                    {calcule && <p className="mur-note">Angle calculé par la diagonale : {enTexte(murs[i].angleDeg)}°</p>}
                    {dernier && <p className="mur-note">Dernier mur : il doit revenir au point de départ.</p>}
                  </div>
                )
              })}
            </div>
            <button type="button" className="btn btn-large" onClick={() => setSaisie([...saisie, murVide()])}>
              ＋ Ajouter un mur
            </button>
          </>
        )}

        <label>
          Hauteur sous plafond (mm)
          <input className="champ" inputMode="decimal" value={hauteur} onChange={(e) => setHauteur(e.target.value)} placeholder="2500" />
        </label>
        <label>
          Remarque
          <input
            className="champ"
            value={remarque}
            onChange={(e) => setRemarque(e.target.value)}
            placeholder="Murs pas d'équerre, plafond qui descend…"
          />
        </label>
        {soucis.length > 0 && <p className="info">Pas encore prête pour Fusion : {soucis.join(' ; ')}.</p>}
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="modale-actions">
          <button type="button" className="btn" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primaire">
            Enregistrer
          </button>
        </div>
        {piece && (
          <button type="button" className="btn btn-danger btn-large" onClick={supprimer}>
            Supprimer la pièce
          </button>
        )}
      </form>
    </div>
  )
}
