alter table factures add column date_paiement date;

update factures
set date_paiement = date_emission + ((18 + abs(hashtext('p' || id)) % 30) * interval '1 day')
where statut = 'payee';
