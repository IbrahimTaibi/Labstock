/* §9.3 — fermer la dernière porte d'écriture destructive sur les règlements.

   Supabase accorde par défaut TOUS les droits de table aux rôles `anon` et
   `authenticated` sur le schéma `public`, TRUNCATE compris. Or TRUNCATE
   n'est pas soumis au RLS : aucune politique ne le filtre, et un seul ordre
   viderait l'historique des règlements de tous les laboratoires à la fois.

   Révoquer UPDATE et DELETE sans révoquer TRUNCATE laissait donc la règle
   d'immuabilité ouverte par le haut.

   Portée : ces deux tables seulement, celles dont le cahier des charges
   exige explicitement l'immuabilité. Les 33 autres tables du schéma portent
   la même permission par défaut — c'est un durcissement à mener à part,
   après décision. */

revoke truncate on public.supplier_payments from anon, authenticated;

/* Même raisonnement pour les réceptions : reverse_goods_receipt() existe
   précisément pour qu'une réception ne soit jamais effacée. */
revoke truncate on public.goods_receipts, public.goods_receipt_lines
  from anon, authenticated;
