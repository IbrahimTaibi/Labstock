/* Réception des analyses prescrites depuis le logiciel de laboratoire (§9).

   Choix d'architecture : la signature HMAC est vérifiée *dans la base*,
   pas dans l'application.
     - le secret partagé ne transite jamais par l'environnement Next.js ;
     - l'endpoint HTTP n'a besoin d'aucune clé de service : c'est la
       connaissance du secret, prouvée par la signature, qui autorise
       l'écriture — pas le rôle du client.

   Corollaire : la fonction ne lève jamais d'exception sur un rejet. Une
   exception annulerait la transaction, donc la ligne de journal qui
   documente ce rejet — exactement ce que l'audit ISO 15189 exige de
   conserver. Elle renvoie un statut, et c'est la route HTTP qui le traduit
   en code de réponse. */

create extension if not exists pgcrypto with schema extensions;

-- Connecteurs LIS déclarés, un par laboratoire (ou plusieurs : multi-source).
create table lis_sources (
  id serial primary key,
  lab_id integer not null references laboratories(id),
  slug text not null unique,
  name text not null,
  /* Secret partagé avec le LIS. Volontairement hors des colonnes
     accessibles au rôle `authenticated` (voir les grants plus bas). */
  secret text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_event_at timestamptz
);

create index lis_sources_lab_id_idx on lis_sources (lab_id);

/* Journal des appels entrants : payload brut, signature, verdict. C'est la
   pièce d'audit du flux — elle est écrite même quand l'appel est rejeté. */
create table lis_webhook_events (
  id bigserial primary key,
  source_id int references lis_sources(id) on delete set null,
  lab_id integer references laboratories(id),
  slug text,
  prescription_id text,
  payload text not null,
  signature text,
  status text not null check (status in (
    'accepted', 'duplicate', 'unknown_source', 'invalid_signature',
    'unknown_analysis', 'malformed'
  )),
  detail text,
  analyses_created int not null default 0,
  received_at timestamptz not null default now()
);

create index lis_webhook_events_lab_idx on lis_webhook_events (lab_id, received_at desc);

/* Idempotence : une même prescription acceptée deux fois ne doit jamais
   produire deux déductions de stock. L'index partiel laisse en revanche
   coexister autant de lignes de rejet que d'appels ratés. */
create unique index lis_webhook_events_prescription_key
  on lis_webhook_events (lab_id, prescription_id)
  where status = 'accepted';

alter table lis_sources enable row level security;
alter table lis_webhook_events enable row level security;

create policy "lecture par laboratoire" on lis_sources
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));

create policy "lecture par laboratoire" on lis_webhook_events
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));

/* Grants par colonne : `secret` n'est lisible par personne d'autre que le
   propriétaire, donc que la fonction SECURITY DEFINER ci-dessous. */
grant select (id, lab_id, slug, name, active, created_at, last_event_at)
  on lis_sources to authenticated;
grant select on lis_webhook_events to authenticated;

/* Le `batch_ref` porte l'identifiant de prescription du LIS : c'est le lien
   de traçabilité entre une sortie de stock et l'analyse qui l'a motivée
   (§10.6). */
comment on column lis_orders.batch_ref is
  'Identifiant de prescription du LIS, ou référence du lot simulé.';

create or replace function public.ingest_lis_analyses(
  p_slug text,
  p_signature text,
  p_payload text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_source record;
  v_expected text;
  v_given text := lower(regexp_replace(coalesce(p_signature, ''), '^sha256=', ''));
  v_json jsonb;
  v_prescription text;
  v_items jsonb;
  v_item jsonb;
  v_code text;
  v_samples int;
  v_analysis_id int;
  v_missing text[] := '{}';
  v_created int := 0;
  v_event_id bigint;
  v_index int;
  v_diff int := 0;
begin
  select * into v_source from lis_sources where slug = p_slug and active;

  if not found then
    insert into lis_webhook_events (slug, payload, signature, status, detail)
    values (p_slug, p_payload, p_signature, 'unknown_source',
            'Aucun connecteur actif pour ce slug');
    return jsonb_build_object('status', 'unknown_source');
  end if;

  /* Comparaison en temps constant : `=` sur du texte s'arrête au premier
     octet différent et laisse fuiter la signature attendue, octet par
     octet, à qui mesure les temps de réponse. La boucle, elle, parcourt
     toujours la totalité de la chaîne. */
  v_expected := encode(hmac(p_payload, v_source.secret, 'sha256'), 'hex');

  if length(v_given) = length(v_expected) then
    for v_index in 1..length(v_expected) loop
      v_diff := v_diff | (ascii(substr(v_given, v_index, 1))
                          # ascii(substr(v_expected, v_index, 1)));
    end loop;
  else
    v_diff := 1;
  end if;

  if v_diff <> 0 then
    insert into lis_webhook_events (
      source_id, lab_id, slug, payload, signature, status, detail
    )
    values (v_source.id, v_source.lab_id, p_slug, p_payload, p_signature,
            'invalid_signature', 'Signature HMAC-SHA256 non concordante');
    return jsonb_build_object('status', 'invalid_signature');
  end if;

  begin
    v_json := p_payload::jsonb;
  exception when others then
    insert into lis_webhook_events (
      source_id, lab_id, slug, payload, signature, status, detail
    )
    values (v_source.id, v_source.lab_id, p_slug, p_payload, p_signature,
            'malformed', 'Corps de requête JSON illisible');
    return jsonb_build_object('status', 'malformed');
  end;

  v_prescription := nullif(trim(v_json->>'prescription_id'), '');
  v_items := v_json->'analyses';

  if v_prescription is null
     or v_items is null
     or jsonb_typeof(v_items) <> 'array'
     or jsonb_array_length(v_items) = 0 then
    insert into lis_webhook_events (
      source_id, lab_id, slug, prescription_id, payload, signature, status, detail
    )
    values (v_source.id, v_source.lab_id, p_slug, v_prescription, p_payload,
            p_signature, 'malformed',
            'Champs attendus : prescription_id (texte) et analyses (tableau non vide)');
    return jsonb_build_object('status', 'malformed');
  end if;

  -- Idempotence : la même prescription déjà acceptée ne rejoue rien.
  if exists (
    select 1 from lis_webhook_events
    where lab_id = v_source.lab_id
      and prescription_id = v_prescription
      and status = 'accepted'
  ) then
    insert into lis_webhook_events (
      source_id, lab_id, slug, prescription_id, payload, signature, status, detail
    )
    values (v_source.id, v_source.lab_id, p_slug, v_prescription, p_payload,
            p_signature, 'duplicate', 'Prescription déjà intégrée');
    return jsonb_build_object('status', 'duplicate', 'prescription_id', v_prescription);
  end if;

  /* Tout ou rien : une prescription dont un seul code est inconnu n'est pas
     intégrée à moitié. Le LIS rejouera après correction du référentiel. */
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_code := nullif(trim(v_item->>'code'), '');
    select id into v_analysis_id
    from analyses where code = v_code and lab_id = v_source.lab_id;
    if v_code is null or v_analysis_id is null then
      v_missing := v_missing || coalesce(v_code, '(code absent)');
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    insert into lis_webhook_events (
      source_id, lab_id, slug, prescription_id, payload, signature, status, detail
    )
    values (v_source.id, v_source.lab_id, p_slug, v_prescription, p_payload,
            p_signature, 'unknown_analysis',
            'Codes analyse inconnus : ' || array_to_string(v_missing, ', '));
    return jsonb_build_object(
      'status', 'unknown_analysis',
      'unknown_codes', to_jsonb(v_missing)
    );
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    v_code := trim(v_item->>'code');
    v_samples := coalesce((v_item->>'sample_count')::int, 0);

    if v_samples <= 0 then
      insert into lis_webhook_events (
        source_id, lab_id, slug, prescription_id, payload, signature, status, detail
      )
      values (v_source.id, v_source.lab_id, p_slug, v_prescription, p_payload,
              p_signature, 'malformed',
              'sample_count doit être un entier strictement positif pour ' || v_code);
      return jsonb_build_object('status', 'malformed');
    end if;

    select id into v_analysis_id
    from analyses where code = v_code and lab_id = v_source.lab_id;

    insert into lis_orders (batch_ref, analysis_id, sample_count, lab_id)
    values (v_prescription, v_analysis_id, v_samples, v_source.lab_id);

    v_created := v_created + 1;
  end loop;

  insert into lis_webhook_events (
    source_id, lab_id, slug, prescription_id, payload, signature, status,
    analyses_created
  )
  values (v_source.id, v_source.lab_id, p_slug, v_prescription, p_payload,
          p_signature, 'accepted', v_created)
  returning id into v_event_id;

  update lis_sources set last_event_at = now() where id = v_source.id;

  return jsonb_build_object(
    'status', 'accepted',
    'event_id', v_event_id,
    'prescription_id', v_prescription,
    'analyses_created', v_created
  );
end;
$$;

/* Appelée par l'endpoint webhook, qui n'a pas de session utilisateur :
   l'autorisation vient de la signature, vérifiée ci-dessus. */
revoke all on function public.ingest_lis_analyses(text, text, text) from public;
grant execute on function public.ingest_lis_analyses(text, text, text) to anon, authenticated;
