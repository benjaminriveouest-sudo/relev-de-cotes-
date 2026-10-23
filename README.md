# Relevé de cotes

Appli web installable (PWA) pour relever des cotes sur photo, sur chantier, même sans réseau.
Spécifications complètes : `docs/cahier-des-charges.md`.

## Étape 1 : prototype d'annotation photo

- Prendre une photo (appareil photo arrière) ou importer depuis la galerie
- Tracer une cote : toucher le premier point, puis le second ; une loupe aide à viser
- Saisir la valeur en mm au pavé numérique, avec un libellé rapide (Longueur, Hauteur, Entraxe…)
- « Plus tard » laisse la cote sans valeur, signalée en rouge
- Modifier : toucher une cote, glisser ses extrémités, changer la valeur, supprimer
- Repères texte (« Axe poteau », « Nu fini »…)
- Annuler / rétablir, zoom et déplacement à deux doigts
- Sauvegarde automatique sur le téléphone (IndexedDB) à chaque modification

La photo est réduite à 2 560 px de grand côté à l'import et n'est jamais modifiée ensuite :
les cotes sont un calque séparé, en coordonnées de l'image.

## Développement

```bash
npm install
npm run dev      # serveur local
npm test         # tests unitaires (géométrie, historique, stockage)
npm run lint
npm run build    # version de production dans dist/
```

Pour essayer sur téléphone en réseau local : `npm run dev -- --host`, puis ouvrir l'adresse affichée.
Le mode hors ligne et l'installation demandent HTTPS : utiliser la version publiée sur GitHub Pages.

Les icônes `public/icons/*.png` sont générées depuis `public/favicon.svg` avec `node scripts/icones.mjs` (nécessite Playwright).

## Structure

```
src/
├── models/                 types (Photo, Cote, Repere) et identifiants
├── db/                     stockage local Dexie
├── features/photos/        prise de vue, import, liste
├── features/annotation/    éditeur Konva, loupe, pavé numérique, annuler/rétablir
└── ui/                     utilitaires d'affichage
```
