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
| `/receipts` | Réceptions fournisseurs : bon de commande, saisie de lot, contrôles ISO |
| `/issues` | Sorties de stock : analyses prescrites, consommables calculés, déduction |

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

## Réceptions fournisseurs

`/receipts` est l'entrée de stock, symétrique des sorties. On choisit une ligne
de bon de commande, on saisit la quantité livrée, le numéro de lot et la
péremption ; `receive_goods()` crée le lot, augmente le stock, écrit un
mouvement d'entrée, incrémente le reçu de la ligne et recalcule le statut de la
commande — le tout dans une seule transaction.

Les **contrôles ISO 15189** affichés à droite ne sont pas décoratifs : ce sont
exactement les validations appliquées en base. Le serveur refuse une péremption
déjà atteinte, un lot vide, une quantité supérieure au reste à recevoir, et
distingue deux cas au numéro de lot déjà connu :

- même produit et même péremption → **complément** de lot (une commande peut
  arriver en plusieurs livraisons) ;
- produit ou péremption différents → **refus**, c'est une erreur de saisie.

La ligne de commande est verrouillée pendant la transaction, donc deux
réceptions simultanées ne peuvent pas dépasser ensemble la quantité commandée.

## Sorties de stock (consommation liée aux analyses)

Chaque analyse déclare ses consommables et un **coefficient de consommation**
par test (`analysis_consumables`). La vue `pending_consumables` en déduit les
quantités à sortir pour les analyses encore en attente.

Le calcul est fait **par analyse** : pour un consommable donné, seuls les
échantillons des analyses qui l'utilisent réellement sont comptés. Multiplier
chaque consommable par le total des échantillons imputerait par exemple des
tubes EDTA à une glycémie, qui n'en consomme aucun. Les quantités sont
arrondies au supérieur, un consommable étant indivisible.

La déduction passe par `issue_stock()`, en **une seule transaction** :

- les analyses en attente sont verrouillées puis marquées `consumed`, ce qui
  rend un double envoi inoffensif ;
- les lots sont consommés en FEFO, en cascade si le premier ne suffit pas ;
- `products.stock_qty`, `lots.current_qty`, `stock_movements` et l'historique
  de sortie sont mis à jour ensemble ;
- si un seul consommable manque, **rien** n'est déduit.

`issue_stock()` et `sync_lis_orders()` sont en `SECURITY DEFINER`, à dessein :
la mutation du stock reste le monopole de ces procédures. Accorder `UPDATE`
sur `products` au rôle `authenticated` laisserait n'importe quel client fixer
un stock arbitraire en contournant le calcul FEFO et la traçabilité. En
contrepartie, les deux fonctions vérifient `auth.uid()` dans leur corps, figent
leur `search_path` et ne sont exécutables que par `authenticated`.

> ⚠️ **Aucun connecteur LIS réel n'est branché.** `sync_lis_orders()` fabrique
> un lot d'analyses prescrites pour rendre le flux exécutable ; la source est
> affichée comme « Simulé » dans l'interface. Un vrai connecteur remplacerait
> le corps de cette fonction en insérant dans `lis_orders`.

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
