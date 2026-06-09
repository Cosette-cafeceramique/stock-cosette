# Cosette — Inventaire & Marges avec Supabase + Vercel

Cette version est une vraie app web :
- React + Vite
- Supabase pour la connexion et la base de données
- Vercel pour l’hébergement
- TVA simple : TVA collectée, TVA achat récupérable, TVA nette estimée
- marge HT réelle
- frais fixes par pièce : peinture, cuisson, emballage, autres frais, frais paiement
- stock, alertes, mouvements

## 1. Créer le projet Supabase

1. Va sur Supabase.
2. Crée un nouveau projet.
3. Va dans `SQL Editor`.
4. Copie-colle tout le contenu du fichier :

`supabase/schema.sql`

5. Exécute le script.

## 2. Récupérer les clés Supabase

Dans Supabase :

`Project Settings > API`

Récupère :
- Project URL
- anon public key

Crée un fichier `.env` à la racine du projet, en copiant `.env.example` :

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Ne mets jamais la clé `service_role` dans cette app.

## 3. Lancer en local

Installe Node.js si besoin, puis dans le dossier :

```bash
npm install
npm run dev
```

Ouvre l’adresse indiquée par Vite, souvent :

`http://localhost:5173`

## 4. Créer ton compte

Dans l’app :
1. Clique sur “Créer un compte”.
2. Mets ton email et un mot de passe.
3. Confirme l’email si Supabase le demande.

L’app va ensuite t’afficher ton UUID utilisateur.

## 5. Donner l’accès Cosette à ton compte

Dans Supabase :
1. Va dans `Table Editor`.
2. Ouvre la table `app_members`.
3. Ajoute une ligne :
   - `user_id` = ton UUID affiché dans l’app
   - `email` = ton email
   - `role` = `admin`

Ensuite, recharge l’app.

## 6. Déployer sur Vercel

1. Crée un compte Vercel.
2. Mets ce projet dans un dépôt GitHub.
3. Dans Vercel, clique sur `Add New Project`.
4. Importe le dépôt.
5. Dans `Environment Variables`, ajoute :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy.

## 7. Domaine IONOS

Une fois le projet déployé sur Vercel, ajoute ton domaine dans Vercel, par exemple :

`inventaire.cosette-cafeceramique.fr`

Vercel te donnera les DNS à mettre chez IONOS.

## 8. Sécurité

La base utilise RLS.
Seuls les utilisateurs présents dans `app_members` peuvent voir et modifier l’inventaire.

Conseil :
- dans Supabase Auth, désactive l’inscription libre après avoir créé tes comptes
- ajoute Akim ou une personne de l’équipe en créant leur compte puis en ajoutant leur UUID à `app_members`

## 9. Modifications prévues ensuite

On pourra ajouter :
- pièces à récupérer
- pièces en attente de cuisson
- commandes fournisseurs
- export comptable mensuel
- calcul du coût réel de cuisson
- catégories Cosette personnalisées
- interface mobile encore plus rapide
- rôles équipe/admin
- import CSV

## Mise à jour V2 — Admin + références

Avant de redéployer sur Vercel, exécute dans Supabase > SQL Editor le fichier :

`supabase/update-v2-admin-references.sql`

Cette mise à jour ajoute :
- `store_reference` : référence magasin Cosette
- `supplier_reference` : référence fournisseur
- un outil admin pour vider tout l’inventaire
- le code de validation : `SUPPRIMER`

Ensuite, pousse les fichiers mis à jour sur GitHub. Vercel redéploiera automatiquement.

Pour vider l’inventaire :
1. Ouvre l’app.
2. Va dans l’onglet `Admin`.
3. Tape exactement `SUPPRIMER`.
4. Clique sur `Supprimer tout l’inventaire`.

Cette action supprime aussi l’historique des mouvements.


## Mise à jour V3 — Responsive + réglages + import stock photo

Avant de mettre à jour GitHub, exécute dans Supabase > SQL Editor :

`supabase/update-v3-settings-import-stock-photo.sql`

Cette mise à jour :
- ajoute une table `app_settings`
- ajoute l’onglet `Réglages` dans l’app
- permet de modifier les valeurs par défaut : frais carte bancaire, peinture, cuisson, emballage, TVA, seuil de stock, etc.
- ajoute une vue mobile plus lisible
- importe le stock lu depuis la photo

Attention : le script V3 supprime l’inventaire actuel et l’historique des mouvements avant d’importer le stock photo.

Les références fournisseur de la photo n’étaient pas visibles/lisibles : elles sont mises à `A_COMPLETER`.
Les références magasin sont générées automatiquement : `COS-001`, `COS-002`, etc.

## Mise à jour V4 — réglages appliquables + stock immobilisé

Avant de pousser les fichiers sur GitHub, lance dans Supabase > SQL Editor :

`supabase/update-v4-defaults-dashboard.sql`

La V4 ajoute :
- affichage dashboard du stock immobilisé en coût d’achat HT ;
- affichage du coût complet potentiel ;
- possibilité d’enregistrer les réglages par défaut ;
- bouton pour appliquer les réglages à tout l’inventaire existant ;
- bouton pour recalculer la TVA achat récupérable selon le taux par défaut.

Ensuite, pousse les fichiers sur GitHub et Vercel redéploiera automatiquement.
