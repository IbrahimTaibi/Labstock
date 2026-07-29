# LABSTOCK — Gestion des stocks de laboratoire

Application de gestion de stock et de facturation pour un laboratoire
d'analyses, construite avec **Next.js 16** (App Router), **Supabase** (Postgres
+ Auth) et **Recharts**. L'interface est en français ; le code, les fichiers et
les routes sont en anglais.

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs du projet Supabase
npm run dev
```

## Pages

| Route | Contenu |
|---|---|
| `/login` | Connexion par e-mail et mot de passe |
| `/` | Tableau de bord : indicateurs, répartition du stock, état des factures, mouvements, alertes |
| `/goods` | Gestion des lots en FEFO : saisie, liste filtrable, fiche détaillée, compteurs |

La navigation vit dans une barre latérale permanente. Les entrées marquées
« Bientôt » ne sont pas encore construites et ne pointent volontairement vers
aucune page.

## Authentification

L'accès est **entièrement fermé aux visiteurs anonymes**.

- `src/proxy.ts` (le `middleware` de Next.js 16, renommé `proxy`) rafraîchit la
  session à chaque requête et redirige vers `/login` en l'absence
  d'utilisateur. La vérification utilise `getUser()`, qui revalide le jeton
  auprès du serveur d'auth — contrairement à `getSession()`, dont l'utilisateur
  provient d'un cookie potentiellement falsifiable.
- Le layout `src/app/(app)/layout.tsx` revérifie la session : aucune page
  authentifiée ne peut se rendre sans utilisateur valide.
- Les **Server Actions** revérifient l'utilisateur elles aussi. Une Server
  Action n'est pas une route : un déplacement de fichier peut la sortir du
  périmètre du proxy sans prévenir, la protection ne doit donc jamais reposer
  sur lui seul.
- Les politiques RLS n'accordent la lecture et l'écriture qu'au rôle
  `authenticated`. Le rôle `anon` ne peut plus rien lire, ni exécuter
  `dashboard()`.

Les métadonnées utilisateur (nom, fonction) servent **uniquement à
l'affichage** : elles sont modifiables par l'utilisateur et ne fondent aucune
décision d'autorisation.

### Créer un compte

Il n'y a pas de page d'inscription : les comptes sont créés par un
administrateur depuis le tableau de bord Supabase (*Authentication → Users*),
ou via l'API d'inscription. Supabase valide le domaine de l'adresse, un domaine
sans enregistrement MX est refusé.

## Gestion des lots (FEFO)

Un produit peut avoir plusieurs lots. La règle **FEFO** (*First Expired, First
Out*) est calculée en base par la vue `lots_view` : parmi les lots d'un même
produit encore consommables (non périmés, stock restant), celui dont la
péremption est la plus proche porte le rang 1 et devient le lot **actif** ; les
autres sont inactifs. Le formulaire affiche ce rang en direct, avant
l'enregistrement.

La suppression de lot n'est volontairement pas exposée : l'historique des lots
fait partie de la traçabilité. Une désactivation explicite serait préférable.

## Architecture des données

Toutes les métriques du tableau de bord proviennent d'**un seul appel RPC**,
`public.dashboard()`, qui renvoie un objet JSON typé (`src/lib/types.ts`).
Une page = une requête réseau, et les agrégations restent dans Postgres.

Tables : `categories`, `suppliers`, `products`, `invoices`, `stock_movements`,
`lots`. La RLS est activée sur toutes.

L'historique sur six mois n'est pas stocké : il est **reconstruit** à partir des
mouvements de stock (stock à la date T = stock actuel − mouvements postérieurs).
Les sparklines et les variations « vs mois dernier » reposent donc sur des
données réelles, pas sur des valeurs simulées.

## Conventions de visualisation

- Palette catégorielle à 6 créneaux, validée pour les daltonismes en mode clair
  **et** sombre ; les couleurs suivent la catégorie, jamais son rang.
- Les statuts (payée / en attente / en retard, actif / inactif FEFO) utilisent
  une palette réservée et sont toujours accompagnés d'une icône et d'un
  libellé — la couleur ne porte jamais seule le sens.
- Chaque graphique a une infobulle au survol ; les donuts affichent les valeurs
  en clair dans leur légende.
- Thème clair par défaut, bascule sombre mémorisée dans `localStorage`.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run lint` | ESLint |
