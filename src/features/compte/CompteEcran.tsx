import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import {
  actualiserCompte,
  changerRole,
  codeInvitation,
  connexion,
  creerEntreprise,
  deconnexion,
  inscription,
  listerMembres,
  messageErreur,
  nouveauCodeInvitation,
  rejoindreEntreprise,
  retirerMembre,
  useCompte,
  type Membre,
  type MembreListe,
  type Role,
} from '../../sync/compte'
import { useSynchro } from '../../sync/synchro'
import { BarreSynchro } from './BarreSynchro'

const LIBELLE_ROLE: Record<Role, string> = { terrain: 'Terrain', bureau: 'Bureau' }

/** Lance une action de l'écran en affichant « … » puis l'erreur éventuelle. */
function useAction() {
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string>()
  async function lancer(action: () => Promise<unknown>) {
    setOccupe(true)
    setErreur(undefined)
    try {
      await action()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }
  return { occupe, erreur, lancer }
}

export function CompteEcran({ onRetour }: { onRetour: () => void }) {
  const compte = useCompte()

  return (
    <div className="ecran">
      <header className="barre">
        <button className="btn btn-icone" onClick={onRetour} aria-label="Retour aux chantiers">
          ←
        </button>
        <h1 className="barre-titre">Compte</h1>
      </header>
      <BarreSynchro />
      <div className="compte">
        {compte.statut === 'non_configure' && (
          <p className="info">
            La synchronisation n'est pas encore activée. L'appli fonctionne sur ce téléphone uniquement.
          </p>
        )}
        {compte.statut === 'chargement' && <p>Chargement…</p>}
        {compte.statut === 'deconnecte' && <Connexion />}
        {compte.statut === 'sans_entreprise' && <ChoixEntreprise email={compte.email} />}
        {compte.statut === 'connecte' && <MonCompte membre={compte.membre} />}
      </div>
    </div>
  )
}

function Connexion() {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [message, setMessage] = useState<string>()
  const { occupe, erreur, lancer } = useAction()

  function valider(e: React.FormEvent) {
    e.preventDefault()
    setMessage(undefined)
    lancer(async () => {
      if (mode === 'connexion') await connexion(email, motDePasse)
      else if (!(await inscription(email, motDePasse)))
        setMessage('Compte créé. Ouvrez le lien reçu par e-mail, puis revenez vous connecter.')
    })
  }

  return (
    <>
      <p>
        Avec un compte, vos relevés partent tout seuls au bureau dès que le téléphone capte. Sans compte, tout reste sur
        ce téléphone, comme avant.
      </p>
      <div className="puces">
        <button className={`puce ${mode === 'connexion' ? 'active' : ''}`} onClick={() => setMode('connexion')}>
          Se connecter
        </button>
        <button className={`puce ${mode === 'inscription' ? 'active' : ''}`} onClick={() => setMode('inscription')}>
          Créer un compte
        </button>
      </div>
      <form onSubmit={valider}>
        <label>
          E-mail
          <input
            className="champ"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Mot de passe {mode === 'inscription' && '(6 caractères minimum)'}
          <input
            className="champ"
            type="password"
            autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <button type="submit" className="btn btn-primaire" disabled={occupe}>
          {occupe ? '…' : mode === 'connexion' ? 'Se connecter' : 'Créer le compte'}
        </button>
      </form>
      {erreur && <p className="erreur">{erreur}</p>}
      {message && <p>{message}</p>}
    </>
  )
}

function ChoixEntreprise({ email }: { email: string }) {
  const [nom, setNom] = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [code, setCode] = useState('')
  const [nbChantiers, setNbChantiers] = useState(0)
  const { occupe, erreur, lancer } = useAction()

  useEffect(() => {
    db.chantiers.count().then(setNbChantiers)
  }, [])

  return (
    <>
      <p>
        Connecté avec <strong>{email}</strong>. Il reste à rejoindre votre entreprise.
      </p>
      {nbChantiers > 0 && (
        <p className="info" style={{ padding: 0 }}>
          Les {nbChantiers} chantier{nbChantiers > 1 ? 's' : ''} déjà sur ce téléphone seront partagés avec l'entreprise.
        </p>
      )}
      <label>
        Votre nom (sur les PDF)
        <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" />
      </label>

      <h2 className="section">J'ai un code d'invitation</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          lancer(() => rejoindreEntreprise(code, nom))
        }}
      >
        <input
          className="champ"
          placeholder="Code donné par le bureau"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primaire" disabled={occupe || !nom.trim() || !code.trim()}>
          Rejoindre l'entreprise
        </button>
      </form>

      <h2 className="section">Ou créer l'entreprise</h2>
      <p className="info" style={{ padding: 0 }}>
        Vous serez le compte « Bureau » : vous validez les relevés et invitez les collègues.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          lancer(() => creerEntreprise(entreprise, nom))
        }}
      >
        <input
          className="champ"
          placeholder="Nom de l'entreprise"
          value={entreprise}
          onChange={(e) => setEntreprise(e.target.value)}
        />
        <button type="submit" className="btn" disabled={occupe || !nom.trim() || !entreprise.trim()}>
          Créer l'entreprise
        </button>
      </form>

      {erreur && <p className="erreur">{erreur}</p>}
      <button className="btn" onClick={() => void deconnexion()}>
        Se déconnecter
      </button>
    </>
  )
}

function MonCompte({ membre }: { membre: Membre }) {
  const synchro = useSynchro()
  const [confirmer, setConfirmer] = useState(false)

  return (
    <>
      <dl className="fiche" style={{ margin: 0 }}>
        <div className="fiche-ligne">
          <dt>Entreprise</dt>
          <dd>{membre.entrepriseNom}</dd>
        </div>
        <div className="fiche-ligne">
          <dt>Vous</dt>
          <dd>
            {membre.nom} · {LIBELLE_ROLE[membre.role]}
          </dd>
        </div>
        <div className="fiche-ligne">
          <dt>E-mail</dt>
          <dd>{membre.email}</dd>
        </div>
      </dl>
      <p className="info" style={{ padding: 0 }}>
        {membre.role === 'bureau'
          ? 'Vous pouvez valider les relevés et gérer les membres.'
          : 'Seul le bureau peut passer un ouvrage en « Validé ».'}
      </p>

      {membre.role === 'bureau' && <Bureau membre={membre} />}

      <h2 className="section">Ce téléphone</h2>
      {!confirmer ? (
        <button className="btn" onClick={() => setConfirmer(true)}>
          Se déconnecter
        </button>
      ) : (
        <>
          <p>
            Les relevés restent sur ce téléphone.
            {synchro.enAttente > 0 &&
              ` Attention : ${synchro.enAttente} modification${synchro.enAttente > 1 ? 's ne sont' : ' n’est'} pas encore envoyée${synchro.enAttente > 1 ? 's' : ''} ; elles partiront à la prochaine connexion.`}
          </p>
          <div className="modale-actions">
            <button className="btn" onClick={() => setConfirmer(false)}>
              Annuler
            </button>
            <button className="btn btn-danger" onClick={() => void deconnexion()}>
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </>
  )
}

function Bureau({ membre }: { membre: Membre }) {
  const [code, setCode] = useState<string>()
  const [membres, setMembres] = useState<MembreListe[]>()
  const { occupe, erreur, lancer } = useAction()

  useEffect(() => {
    let annule = false
    Promise.all([codeInvitation(), listerMembres()])
      .then(([c, m]) => {
        if (annule) return
        setCode(c)
        setMembres(m)
      })
      .catch(() => !annule && setCode('hors ligne'))
    return () => {
      annule = true
    }
  }, [])

  return (
    <>
      <h2 className="section">Inviter un collègue</h2>
      <p>Donnez-lui ce code. Il crée son compte dans l'appli, puis le saisit dans « J'ai un code d'invitation ».</p>
      <p className="code-invitation">{code ?? '…'}</p>
      <button className="btn" disabled={occupe} onClick={() => lancer(async () => setCode(await nouveauCodeInvitation()))}>
        Changer le code (l'ancien ne marchera plus)
      </button>

      <h2 className="section">Membres</h2>
      {membres?.map((m) => (
        <div key={m.user_id} className="membre">
          <span className="membre-nom">
            {m.nom}
            {m.user_id === membre.userId && ' (vous)'}
            <small>{m.email}</small>
          </span>
          <button
            className={`btn ${m.role === 'bureau' ? 'actif' : ''}`}
            disabled={occupe}
            onClick={() =>
              lancer(async () => {
                await changerRole(m.user_id, m.role === 'bureau' ? 'terrain' : 'bureau')
                setMembres(await listerMembres())
                actualiserCompte()
              })
            }
          >
            {LIBELLE_ROLE[m.role]}
          </button>
          {m.user_id !== membre.userId && (
            <button
              className="btn btn-danger"
              disabled={occupe}
              onClick={() => {
                if (!window.confirm(`Retirer ${m.nom} de l'entreprise ?`)) return
                lancer(async () => {
                  await retirerMembre(m.user_id)
                  setMembres(await listerMembres())
                })
              }}
            >
              Retirer
            </button>
          )}
        </div>
      ))}
      <p className="info" style={{ padding: 0 }}>
        Touchez le rôle pour passer quelqu'un de Terrain à Bureau ou l'inverse.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}
    </>
  )
}
