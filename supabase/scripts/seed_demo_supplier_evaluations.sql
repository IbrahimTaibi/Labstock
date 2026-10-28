/* Jeu de démonstration : évaluations fournisseurs (juillet → octobre 2026)
   et compléments de fiche (catégorie, conditions de paiement).

   À exécuter APRÈS la migration 20261028180000_supplier_management.sql.
   Insertion / mise à jour seulement ; rejouable (les évaluations d'un même
   mois sont remplacées). */

do $$
declare
  v_lab integer := (select min(id) from public.laboratories);
begin
  -- Fiches : catégorie et conditions alignées sur les factures de démonstration.
  update public.suppliers s set
    category = f.category,
    payment_terms_days = f.terms
  from (values
    ('MMM', 'Fournisseur de réactifs', 60),
    ('PROCHIDIA', 'Consommables de laboratoire', 30),
    ('LABO DR MED NEJIB BAROUNI', 'Fournisseur de réactifs', 30),
    ('LABO BIODHAOUADI', 'Fournisseur de réactifs', 0),
    ('SMS SCIENTIFIC', 'Équipements et instruments', 30),
    ('BIO HEALTH', 'Consommables de laboratoire', 45)
  ) as f(name, category, terms)
  where s.lab_id = v_lab and s.name = f.name;

  insert into public.supplier_evaluations (
    lab_id, supplier_id, period, quality, delays, documents, service, pricing,
    comment, evaluated_by
  )
  select v_lab, s.id, e.period, e.quality, e.delays, e.documents, e.service,
         e.pricing, e.comment, 'Démonstration'
  from (values
    ('MMM', date '2026-07-01', 4.5, 4.0, 4.5, 4.5, 4.0, null),
    ('MMM', date '2026-08-01', 4.5, 4.0, 5.0, 4.5, 4.0, null),
    ('MMM', date '2026-09-01', 4.5, 4.5, 5.0, 4.5, 4.5, null),
    ('MMM', date '2026-10-01', 4.5, 4.0, 5.0, 4.5, 4.5, 'Livraison VIDAS du 21/10 avec un jour de retard.'),
    ('PROCHIDIA', date '2026-08-01', 4.0, 4.5, 4.0, 4.0, 4.0, null),
    ('PROCHIDIA', date '2026-10-01', 4.5, 4.5, 4.0, 4.0, 4.0, null),
    ('SMS SCIENTIFIC', date '2026-08-01', 3.5, 2.5, 3.0, 3.0, 3.5, 'Retards répétés sur les consommables.'),
    ('SMS SCIENTIFIC', date '2026-10-01', 3.0, 2.5, 3.0, 2.5, 3.5, 'Facture d''août toujours contestée.'),
    ('LABO BIODHAOUADI', date '2026-09-01', 4.0, 4.0, 3.5, 4.5, 3.5, null),
    ('LABO DR MED NEJIB BAROUNI', date '2026-10-01', 4.5, 4.0, 4.0, 5.0, 4.0, null),
    ('BIO HEALTH', date '2026-10-01', 3.5, 3.5, 4.0, 3.5, 4.5, null)
  ) as e(name, period, quality, delays, documents, service, pricing, comment)
  join public.suppliers s on s.lab_id = v_lab and s.name = e.name
  on conflict (supplier_id, period) do update set
    quality = excluded.quality,
    delays = excluded.delays,
    documents = excluded.documents,
    service = excluded.service,
    pricing = excluded.pricing,
    comment = excluded.comment;
end $$;
