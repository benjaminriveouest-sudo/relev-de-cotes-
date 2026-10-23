# Mettre en place Supabase (comptes et synchronisation)

Supabase est le service en ligne qui garde les relevés de l'entreprise. L'offre gratuite suffit pour le test interne.

## 1. Créer le compte et le projet

1. Sur [supabase.com](https://supabase.com), « Start your project », puis « Continue with GitHub ».
2. « New project » : nom `releve-de-cotes`, région **Europe** (Paris ou Frankfurt).
   Le mot de passe de base demandé est à garder pour soi : l'appli n'en a pas besoin.

## 2. Créer les tables et les règles

1. Menu de gauche, « SQL Editor », « New query ».
2. Coller tout le contenu de [`supabase/schema.sql`](../supabase/schema.sql), puis « Run ». Le message attendu est « Success. No rows returned ».

## 3. Connexion sans e-mail de confirmation

L'offre gratuite n'envoie que quelques e-mails par heure. Pour que les collègues puissent créer leur compte sans attendre :

« Authentication », « Sign In / Providers », « Email » : décocher **Confirm email**, puis « Save ».

## 4. Donner l'adresse et la clé publique

« Project Settings », « API Keys » (ou « Data API ») :

- l'**URL du projet** (`https://xxxx.supabase.co`) ;
- la **clé publique** (`sb_publishable_…`, ou l'ancienne clé `anon`).

Elles vont dans [`src/sync/config.ts`](../src/sync/config.ts). Elles sont faites pour être publiques : sans compte, elles ne donnent accès à rien.

**Ne jamais** mettre dans le dépôt la clé `secret` / `service_role` ni le mot de passe de la base.

## Bon à savoir

- Le projet gratuit se met en pause après 7 jours sans aucune utilisation. Les données restent ; il suffit de cliquer sur « Restore project » dans Supabase. Pendant la pause, les téléphones gardent tout et renvoient ensuite.
- Pas de sauvegarde quotidienne dans l'offre gratuite : à prévoir avant les clients pilotes.
