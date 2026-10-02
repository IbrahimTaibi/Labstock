/* Reprise de l'historique des règlements.

   `supplier_debts_view` déduit le solde des lignes de `supplier_payments`.
   Or le suivi des paiements n'existait pas : les factures déjà réglées le
   signalaient par `status = 'paid'` et une `payment_date`, sans montant.
   Sans reprise, la vue présenterait toutes les factures de l'historique
   comme impayées — soit, sur la base actuelle, plus de 5 M TND de dette
   fictive au lieu des ~318 k TND réellement dus.

   On matérialise donc un règlement par facture soldée, daté du jour du
   paiement connu. Le montant repris est celui que la vue calcule
   (`amount_due`), et non `invoices.amount` : c'est le seul moyen que le
   solde tombe exactement à zéro. Un écart d'arrondi d'un millime suffirait
   à faire ressortir la facture comme échue.

   `method = 'other'` : le mode de règlement n'a jamais été saisi, et
   inventer « virement » serait une donnée fausse dans une pièce comptable. */

insert into supplier_payments (
  lab_id, invoice_id, amount, paid_at, method, note
)
select
  d.lab_id,
  d.invoice_id,
  d.amount_due,
  i.payment_date,
  'other',
  'Reprise d''historique : facture soldée avant la mise en place du suivi des règlements.'
from supplier_debts_view d
join invoices i on i.id = d.invoice_id
where d.source = 'supplier'
  and i.status = 'paid'
  and i.payment_date is not null
  and d.amount_due > 0;
