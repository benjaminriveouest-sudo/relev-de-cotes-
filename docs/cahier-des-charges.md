# Cahier des charges – Appli de relevé de cotes (V1)

## Contexte et objectif

L'appli remplace le relevé de cotes papier par un relevé sur téléphone : photo annotée, croquis et notes, envoyés propres au bureau d'études.

Aujourd'hui, les cotes prises sur chantier sont griffonnées, perdues ou mal relues. Le bureau d'études doit rappeler le poseur, voire retourner sur place. L'objectif de la V1 est qu'un relevé fait sur place soit **exploitable tel quel** par le bureau d'études, sans ressaisie ni question.

L'appli est d'abord testée en interne dans une métallerie, puis proposée à d'autres artisans du bâtiment (métalliers, menuisiers, vitriers).

## Utilisateurs cibles

| Profil | Où | Ce qu'il fait | Ce qui compte pour lui |
| --- | --- | --- | --- |
| Métreur / poseur / chef d'équipe | Sur chantier, téléphone | Prend les photos, trace les cotes, ajoute des notes | Rapidité, gros boutons, fonctionne avec des gants et sans réseau |
| Bureau d'études / chef d'entreprise | Au bureau, ordinateur | Consulte les relevés, exporte en PDF, prépare les plans | Cotes lisibles, rien d'oublié, tout classé par chantier |

## Périmètre V1

**Dans la V1**

- Gestion des chantiers et des ouvrages à relever
- Photo annotée avec cotes tracées au doigt
- Croquis libre sur fond quadrillé
- Notes texte et notes vocales
- Export PDF d'une fiche de relevé par ouvrage
- Fonctionnement hors ligne avec synchronisation
- Comptes utilisateurs d'une même entreprise

**Hors V1 (plus tard)**

- Dossier de fin de chantier (DOE)
- Devis et chiffrage
- Export DXF ou import dans un logiciel de CAO
- Mesure automatique par télémètre Bluetooth ou réalité augmentée
- Applis natives dans les stores
- Facturation et abonnements en ligne

## Fonctionnalités détaillées

L'annotation de cotes sur photo est le cœur de l'appli : elle doit être la plus soignée.

### 1. Chantiers et ouvrages

- Créer un chantier : nom, client, adresse, date, contact sur place
- Ajouter des ouvrages au chantier : type (garde-corps, escalier, portail, menuiserie…), repère, localisation (« façade sud, R+1 »)
- Statut de l'ouvrage : à relever, relevé, validé par le bureau d'études
- Liste des chantiers avec recherche et filtre par statut

### 2. Photo annotée (priorité n°1)

- Prendre une photo ou en importer une depuis la galerie
- Tracer une cote : deux points touchés au doigt, une ligne avec flèches, puis saisie de la valeur au pavé numérique
- Unité par défaut en millimètres
- Loupe au moment du placement du point pour viser précisément
- Déplacer, modifier ou supprimer une cote ; annuler / rétablir
- Ajouter des repères texte (« axe poteau », « nu fini »)
- Plusieurs photos par ouvrage
- La photo originale est toujours conservée, les annotations sont un calque par-dessus

### 3. Croquis libre

- Fond quadrillé, tracé à main levée ou en lignes droites
- Mêmes outils de cote que sur la photo
- Utile pour une vue de dessus ou une coupe que la photo ne montre pas

### 4. Notes

- Note texte par ouvrage
- Note vocale enregistrée et transcrite automatiquement en texte
- Cases à cocher rapides pour les points récurrents : support (béton, acier, bois), accès, contraintes de pose

### 5. Export PDF

- Une fiche par ouvrage : en-tête chantier, photos annotées en grand, croquis, notes, auteur et date du relevé
- Export d'un chantier complet en un seul PDF
- Partage direct par e-mail ou messagerie depuis le téléphone

### 6. Hors ligne et synchronisation

- Toutes les fonctions de relevé marchent sans réseau
- Synchronisation automatique dès que le réseau revient, avec un indicateur visible (« 3 relevés en attente d'envoi »)
- Consultation des relevés depuis un ordinateur au bureau

### 7. Comptes

- Une entreprise, plusieurs utilisateurs
- Deux rôles : terrain et bureau (le bureau valide les relevés)

## Parcours utilisateur type

Un relevé complet d'un garde-corps doit prendre moins de 5 minutes sur place.

1. Le bureau crée le chantier et la liste des ouvrages à relever.
2. Sur place, le métreur ouvre le chantier sur son téléphone, sans réseau si besoin.
3. Il sélectionne l'ouvrage « Garde-corps balcon R+1 » et prend deux photos.
4. Il trace les cotes sur chaque photo : longueur, hauteur, entraxe des fixations.
5. Il ajoute un croquis vu de dessus et une note vocale sur le type de support.
6. Il passe l'ouvrage en « relevé ».
7. De retour dans une zone couverte, le relevé se synchronise tout seul.
8. Au bureau, le bureau d'études ouvre la fiche, vérifie, exporte le PDF et passe l'ouvrage en « validé ».

## Exigences non fonctionnelles

- **Ergonomie chantier** : boutons d'au moins 48 px, contraste fort lisible en plein soleil, saisie à une main
- **Hors ligne** : aucune perte de données si l'appli est fermée ou si le téléphone s'éteint en cours de relevé
- **Performance** : ouverture d'un chantier en moins de 2 secondes, photos compressées sans perte de lisibilité
- **Compatibilité** : Android et iPhone récents via le navigateur, ordinateur pour le bureau
- **Données** : hébergement en Europe, sauvegarde quotidienne, données de chaque entreprise isolées des autres (RGPD)
- **Sécurité** : connexion par e-mail et mot de passe ou lien magique, accès limité aux membres de l'entreprise

## Choix techniques

Une appli web installable (PWA) suffit pour la V1 : un seul code pour téléphone et ordinateur, pas de passage par les stores.

| Brique | Choix proposé | Pourquoi |
| --- | --- | --- |
| Front | React + TypeScript (Vite) | Standard, bien maîtrisé par Claude Code |
| Mode installable et hors ligne | PWA avec service worker | Fonctionne sans réseau, icône sur l'écran d'accueil |
| Stockage local | IndexedDB (via Dexie) | Garde photos et relevés sur le téléphone avant envoi |
| Annotation photo et croquis | Canvas (Konva) | Gestion simple des lignes, points, zoom et calques |
| Backend, base et fichiers | Supabase (Postgres + stockage + authentification) | Tout-en-un, hébergement possible en Europe |
| Transcription vocale | API de reconnaissance vocale | Note vocale convertie en texte, faite à la synchro si hors ligne |
| PDF | Génération côté navigateur (pdf-lib) | Export possible même sans réseau |

Ces choix sont des propositions de départ, à confirmer au moment du prototype.

## Modèle de données

| Objet | Champs principaux | Lié à |
| --- | --- | --- |
| Entreprise | nom, logo | — |
| Utilisateur | nom, e-mail, rôle (terrain / bureau) | Entreprise |
| Chantier | nom, client, adresse, contact, date | Entreprise |
| Ouvrage | type, repère, localisation, statut | Chantier |
| Photo | image originale, date, auteur | Ouvrage |
| Croquis | taille du quadrillage, tracés | Ouvrage |
| Cote | point A, point B, valeur (mm), libellé | Photo ou croquis |
| Note | texte, audio, cases cochées | Ouvrage |

Chaque objet porte un identifiant généré sur le téléphone et une date de modification, pour pouvoir être créé hors ligne puis synchronisé sans conflit.

## Planning par étapes

1. **Prototype annotation** : prendre une photo, tracer et saisir des cotes, sauvegarder en local. Test sur un vrai chantier.
2. **Chantiers et ouvrages** : création, liste, statuts, stockage local complet.
3. **Croquis et notes** : croquis quadrillé, notes texte, cases à cocher, enregistrement audio.
4. **Export PDF** : fiche par ouvrage et PDF du chantier complet.
5. **Synchronisation et comptes** : backend, connexion, envoi automatique, consultation au bureau, transcription vocale.
6. **Test en interne** : utilisation réelle dans la métallerie pendant quelques semaines, corrections.
7. **Premiers clients pilotes** : 3 à 5 artisans extérieurs, gratuitement ou à prix réduit, en échange de retours.

## Critères de réussite

- Un relevé de garde-corps fait en moins de 5 minutes sur place
- Zéro relevé perdu sur la période de test interne
- Les poseurs l'utilisent d'eux-mêmes plutôt que le papier
- Au moins 2 artisans pilotes prêts à payer à la fin du test

## Questions ouvertes

- Quels types d'ouvrages relève-t-on le plus souvent, et faut-il des modèles de fiche par type ?
- Les cotes doivent-elles gérer les niveaux et les angles dès la V1 ?
- Faut-il pouvoir annoter un plan PDF existant en plus des photos ?
- Quel format de PDF le bureau d'études préfère-t-il (A4 portrait, une photo par page) ?
- Nom de l'appli et prix de l'abonnement
