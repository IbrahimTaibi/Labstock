/* Fiche article : conditionnement et taux de TVA.

   Le conditionnement n'existait que sur les lots et les lignes de commande ;
   l'écran de paramétrage le saisit au niveau de l'article (« Boîte de 100 »,
   « R1: 2x50 ml + R2: 1x50 ml »). Texte libre, comme sur les lots.

   La TVA est portée par l'article pour afficher un prix TTC au catalogue.
   Les factures gardent leur propre `vat_rate` par ligne : le taux de
   l'article est une valeur par défaut, pas une vérité comptable. */

alter table products
  add column packaging text,
  add column vat_rate numeric not null default 0
    check (vat_rate >= 0 and vat_rate <= 100);

comment on column products.packaging is
  'Conditionnement de l''article, texte libre (ex. « Boîte de 100 »).';
comment on column products.vat_rate is
  'Taux de TVA de l''article, en pourcentage (0, 7, 13 ou 19 en Tunisie).';
