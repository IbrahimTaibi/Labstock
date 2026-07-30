# Base de données

Le schéma vit ici, pas seulement dans le projet Supabase distant. Chaque
fichier de `migrations/` porte le nom exact d'une migration enregistrée dans
l'historique du projet : les rejouer dans l'ordre reconstruit la base complète
(tables, vues, fonctions, RLS) sur un projet vierge.

## Reconstruire la base

```bash
supabase link --project-ref <ref-du-projet>
supabase db push
```

`supabase migration list` compare l'historique local et distant ; les deux
doivent afficher les mêmes versions.

## Modifier le schéma

1. `supabase migration new <nom_en_snake_case>` crée le fichier horodaté.
2. Écrire le SQL, l'appliquer (`supabase db push`).
3. `supabase db advisors` avant de committer : il signale les tables sans RLS,
   les fonctions au `search_path` mutable et les `SECURITY DEFINER` exposés.

Ne jamais éditer une migration déjà appliquée : en écrire une nouvelle.

## Ce que les migrations ne contiennent pas

- **Les données.** Le jeu de démonstration (produits, factures, mouvements) a
  été inséré hors migration ; une base reconstruite est vide.
- **Les comptes.** Ils vivent dans `auth.users`. Le premier compte créé après
  `multi_tenant_foundation` devient un simple membre : il faut le passer
  `admin` à la main dans `profiles` pour amorcer l'administration.

## Cloisonnement par laboratoire

Toute table métier porte un `lab_id` dont le défaut est `current_lab_id()`, et
ses politiques RLS filtrent dessus — y compris pour l'administrateur, qui
change de laboratoire via `profiles.active_lab_id` (fonction `set_active_lab`).
L'application n'a donc aucun filtre par laboratoire à écrire : la base s'en
charge. Les fonctions d'écriture sont en `SECURITY INVOKER` pour rester
soumises à ce cloisonnement, et appellent `assert_lab_context()` en préambule.
