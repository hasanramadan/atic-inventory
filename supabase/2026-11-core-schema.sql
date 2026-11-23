-- =====================================================================
-- ATIC · relational layer ("core" schema)                 23 Nov 2026
--
-- The website keeps saving into public.planner_docs and public.app_docs
-- (JSON documents). Triggers on those two tables translate every save,
-- straight away, into the proper relational tables below (primary keys,
-- foreign keys, typed columns). Nothing the website does changes.
--
-- Safety: the translation runs inside its own sub-transaction. If it
-- ever fails, the error is written to core.sync_errors and the user's
-- save still goes through. The core schema is not exposed to the
-- website's public API (only the database owner and direct database
-- connections such as Power BI can read it).
--
-- Safe to run again: it drops and rebuilds the core schema only.
-- public.* tables are never modified, only given two triggers.
-- =====================================================================

drop trigger if exists core_sync on public.planner_docs;
drop trigger if exists core_sync on public.app_docs;
drop schema if exists core cascade;
create schema core;
revoke all on schema core from public, anon, authenticated;
comment on schema core is 'ATIC relational tables, filled automatically from public.planner_docs and public.app_docs';

-- ---------- small helpers --------------------------------------------
create function core.num(t text) returns numeric language plpgsql stable as $$
begin
  if t is null or btrim(t) = '' then return null; end if;
  return replace(btrim(t), ',', '')::numeric;
exception when others then return null;
end $$;

create function core.i(t text) returns int language sql stable as $$ select round(core.num(t))::int $$;

create function core.dt(t text) returns date language plpgsql stable as $$
begin
  if t is null or btrim(t) = '' then return null; end if;
  return left(t, 10)::date;
exception when others then return null;
end $$;

create function core.ts(j jsonb) returns timestamptz language plpgsql stable as $$
begin
  if j is null or jsonb_typeof(j) = 'null' then return null; end if;
  if jsonb_typeof(j) = 'number' then return to_timestamp((j #>> '{}')::numeric / 1000.0); end if;
  return (j #>> '{}')::timestamptz;
exception when others then return null;
end $$;

create function core.b(t text) returns boolean language sql stable as $$
  select case when t in ('true','1','yes') then true when t in ('false','0','no') then false else null end $$;

-- ---------- reference tables -----------------------------------------
create table core.sections (
  code     text primary key,             -- S1, S2 (planner)
  lab_code text not null unique,         -- SEC-1, SEC-2 (lab, recipes)
  name     text not null
);
insert into core.sections values ('S1','SEC-1','Section 1'), ('S2','SEC-2','Section 2');

create table core.products (
  code     text primary key,             -- GM, LS, BW, RW, WV, FC
  name     text not null,
  standard text,                         -- e.g. GSO 2525/2016
  category text
);

create table core.materials (
  code              text primary key,    -- iraqi, sugar, citric ...
  name              text not null,
  unit              text,                -- how it is counted (bucket, bag, kg)
  recipe_unit       text,
  recipe_factor     numeric,             -- recipe units per counted unit
  lead_min_days     int,
  lead_max_days     int,
  safety_weeks      numeric,
  order_cover_weeks numeric,
  order_via         text,
  note              text
);

-- ---------- recipes ---------------------------------------------------
create table core.recipes (
  id           bigint generated always as identity primary key,
  product_code text not null references core.products(code),
  section_code text not null references core.sections(code),
  variant      text not null default 'standard',   -- standard, noirani, nocaramel ...
  name         text,
  unique (product_code, section_code, variant)
);

create table core.recipe_lines (
  recipe_id     bigint not null references core.recipes(id) on delete cascade,
  material_code text   not null references core.materials(code),
  qty_per_batch numeric not null,
  primary key (recipe_id, material_code)
);

create table core.recipe_days (            -- which recipe was used on a day (when not standard)
  day          date not null,
  product_code text not null references core.products(code),
  section_code text not null references core.sections(code),
  variant      text not null,
  primary key (day, product_code, section_code)
);

create table core.recipe_changes (         -- the recipe change log
  id           text primary key,
  product_code text references core.products(code),
  section_code text references core.sections(code),
  change_date  date,
  from_batch   int,
  from_recipe  text,
  to_recipe    text,
  reason       text,
  confirmed    boolean,
  logged_at    timestamptz
);

-- ---------- production -------------------------------------------------
create table core.production_days (        -- one row = one section on one day (Line actuals)
  id                    text primary key,  -- same id as the website: 2026-11-22_S1
  day                   date not null,
  section_code          text not null references core.sections(code),
  lot                   text,
  cartons               int,
  batches_prepared      numeric,
  opening_batches       numeric,
  closing_batches       numeric,
  work_min              int,
  fill_min              int,
  stop_min              int,
  prep_min              int,
  start_min             int,
  clean_routine_min     int,
  clean_deep_min        int,
  last_box              text,
  prev_product          text,
  prev_size             text,
  changeover_type       text,
  changeover_min        int,
  exclude_from_learning boolean not null default false,
  reasons_text          text,
  notes                 text,
  saved_by              uuid references public.profiles(id) on delete set null,
  saved_at              timestamptz,
  unique (day, section_code)
);

create table core.production_runs (        -- one row = one product/size run inside a day
  day_id           text not null references core.production_days(id) on delete cascade,
  run_no           int  not null,
  product_code     text references core.products(code),
  size             text,
  cartons          int,
  batches_prepared numeric,
  opening_batches  numeric,
  closing_batches  numeric,
  batches_used     numeric generated always as
                     (coalesce(opening_batches,0) + coalesce(batches_prepared,0) - coalesce(closing_batches,0)) stored,
  fill_min         int,
  changeover_min   int,
  prep_only        boolean not null default false,
  primary key (day_id, run_no)
);

create table core.stops (                  -- one row = one stoppage reason of a day
  day_id  text not null references core.production_days(id) on delete cascade,
  stop_no int  not null,
  reason  text not null,
  minutes numeric,
  primary key (day_id, stop_no)
);

create table core.forecasts (              -- Line Planner forecasts (one per section per day)
  id               text primary key,       -- 2026-11-23_S2
  day              date not null,
  section_code     text references core.sections(code),
  lot              text,
  cartons_low      int,                    -- P10
  cartons_expected int,                    -- P50
  cartons_high     int,                    -- P90
  fill_min         int,
  stop_min         int,
  finish_time      text,
  explanation      text,
  saved_by         uuid references public.profiles(id) on delete set null,
  saved_at         timestamptz,
  details          jsonb                   -- minute-by-minute timeline, stops by category (kept as JSON on purpose)
);

create table core.forecast_runs (
  forecast_id      text not null references core.forecasts(id) on delete cascade,
  run_no           int  not null,
  product_code     text references core.products(code),
  size             text,
  opening_batches  numeric,
  prepared_batches numeric,
  closing_batches  numeric,
  cartons_expected int,
  start_time       text,
  end_time         text,
  primary key (forecast_id, run_no)
);

create table core.plan_runs (              -- the factory plan (Materials > What we will produce)
  run_no          int primary key,
  product_code    text references core.products(code),
  size            text,
  section_code    text references core.sections(code),
  date_from       date,
  date_to         date,
  batches_per_day numeric,
  cartons         int,
  recipe_variant  text,
  note            text,
  day_overrides   jsonb                    -- per-day batches / cartons exceptions
);

-- ---------- materials stock & orders ----------------------------------
create table core.stock_counts (
  material_code text not null references core.materials(code),
  as_of         date not null,
  qty           numeric,
  source        text,
  primary key (material_code, as_of)
);

create table core.purchase_orders (
  id            text primary key,          -- P00438|iraqi
  po_no         text,
  supplier      text,
  material_code text references core.materials(code),
  qty_ordered   numeric,
  eta           date,
  status        text,                      -- open, partial, closed
  source        text,
  note          text,
  added_on      date
);

create table core.order_receipts (
  order_id    text not null references core.purchase_orders(id) on delete cascade,
  receipt_no  int  not null,
  received_on date,
  qty         numeric,
  in_count    boolean,
  note        text,
  primary key (order_id, receipt_no)
);

-- ---------- lab ----------------------------------------------------------
create table core.lab_people (
  uid          text primary key,
  name         text,
  role         text,
  active       boolean,
  can_test     boolean,
  can_validate boolean,
  user_id      uuid references public.profiles(id) on delete set null
);

create table core.lab_tests (
  product_code text not null references core.products(code),
  id           text not null,              -- t01, t02 ...
  test_no      int,
  name         text,
  kind         text,                       -- chem, micro, org
  method       text,
  unit         text,
  min_value    numeric,
  max_value    numeric,
  formula      text,
  done_for     text,                       -- per batch: SEC-1, SEC-2, all; grouped = 1+2
  grouped      boolean,
  incub_days   int,
  definition   jsonb,                      -- full test setup (inputs, constants) kept as JSON
  primary key (product_code, id)
);

create table core.lab_sessions (           -- one lab record: product + date (+ section)
  id                 text primary key,
  product_code       text references core.products(code),
  section_code       text references core.sections(code),
  test_date          date,
  production_date    date,
  expiry_date        date,
  lot                text,
  tank               text,
  batches            numeric,
  chem_validated_at  timestamptz,
  chem_validated_by  text references core.lab_people(uid),
  final_validated_at timestamptz,
  final_validated_by text references core.lab_people(uid),
  note               text,
  created_at         timestamptz,
  created_by         text references core.lab_people(uid)
);

create table core.lab_samples (
  id              text primary key,
  session_id      text references core.lab_sessions(id) on delete cascade,
  product_code    text references core.products(code),
  code            text,                    -- GM1, BW2 ...
  sample_no       int,
  batch           text,
  tank            text,
  sample_date     date,
  production_date date,
  expiry_date     date,
  pair_of         text,                    -- mate sample (GM 1+2)
  extra           boolean,
  taken_by        text references core.lab_people(uid),
  micro_date      date,
  reason          text,
  created_at      timestamptz,
  created_by      text references core.lab_people(uid)
);

create table core.lab_results (
  sample_id    text not null references core.lab_samples(id) on delete cascade,
  product_code text not null,
  test_id      text not null,
  inputs       jsonb,                      -- what was typed, e.g. {"V": "7.1"}
  input_value  numeric,                    -- the number, when there is one input
  text_value   text,                       -- e.g. Acceptable
  entered_at   timestamptz,
  entered_by   text references core.lab_people(uid),
  late         boolean,
  primary key (sample_id, test_id),
  foreign key (product_code, test_id) references core.lab_tests(product_code, id)
);

create table core.lab_day_batches (        -- batches the lab should test per day
  day          date not null,
  product_code text not null references core.products(code),
  section_code text not null references core.sections(code),
  batches      numeric,
  primary key (day, product_code, section_code)
);

create table core.lab_solutions (
  id           text primary key,           -- naoh01
  name         text,
  chemical     text,
  unit         text,
  nominal      numeric,
  current_conc numeric
);

create table core.lab_solution_history (
  solution_id text not null references core.lab_solutions(id) on delete cascade,
  measured_at timestamptz not null,
  conc        numeric,
  measured_by text,
  primary key (solution_id, measured_at)
);

create table core.lab_activity (
  id     text primary key,
  at     timestamptz,
  by_uid text,
  text   text
);

-- ---------- team ---------------------------------------------------------
create table core.team_posts (
  id        text primary key,
  posted_at timestamptz,
  user_id   uuid references public.profiles(id) on delete set null,
  by_name   text,
  channel   text,
  text      text
);

-- ---------- sync bookkeeping ---------------------------------------------
create table core.sync_errors (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  source  text,
  doc_key text,
  error   text
);

-- ---------- "make sure it exists" helpers (keep foreign keys happy) -----
create function core.sec(t text) returns text language sql stable as $$
  select code from core.sections where code = t or lab_code = t limit 1 $$;

create function core.uid(t text) returns uuid language plpgsql stable as $$
declare u uuid;
begin
  if t is null or t !~* '^[0-9a-f-]{36}$' then return null; end if;
  select id into u from public.profiles where id = t::uuid;
  return u;
end $$;

create function core.p(c text) returns text language plpgsql as $$
begin
  if c is null or btrim(c) = '' then return null; end if;
  insert into core.products(code, name) values (c, c) on conflict do nothing;
  return c;
end $$;

create function core.m(c text) returns text language plpgsql as $$
begin
  if c is null or btrim(c) = '' then return null; end if;
  insert into core.materials(code, name) values (c, c) on conflict do nothing;
  return c;
end $$;

create function core.person(u text) returns text language plpgsql as $$
begin
  if u is null or btrim(u) = '' then return null; end if;
  insert into core.lab_people(uid, name) values (u, u) on conflict do nothing;
  return u;
end $$;

-- =====================================================================
-- Translator 1: planner_docs (daily records)
-- =====================================================================
create function core.sync_planner(p_coll text, p_id text, d jsonb, p_by text, p_at timestamptz, p_deleted boolean)
returns void language plpgsql as $$
declare
  r jsonb; k text; v jsonb; n int; s text; t jsonb; prod jsonb;
begin
  -- ---------------- Line actuals ----------------
  if p_coll = 'actuals' then
    delete from core.production_days where id = p_id;
    if p_deleted or core.sec(d->>'sec') is null or core.dt(d->>'date') is null then return; end if;
    insert into core.production_days values (
      p_id, core.dt(d->>'date'), core.sec(d->>'sec'), d->>'lot',
      core.i(d->>'boxes'), core.num(d->>'batches'),
      coalesce(core.num(d->>'openingBalance'), core.num(d->'runs'->0->>'opening')),
      coalesce(core.num(d->>'closingBalance'), core.num(d->'runs'->-1->>'closing')),
      core.i(d->>'workMin'), core.i(d->>'fillMin'), core.i(d->>'stopMin'), core.i(d->>'prepMin'), core.i(d->>'startMin'),
      core.i(d->>'cleanRoutineMin'), core.i(d->>'cleanDeepMin'), d->>'lastBox', d->>'prevProduct', d->>'prevSize',
      d->'changeover'->>'type', core.i(d->'changeover'->>'min'),
      coalesce(core.b(d->>'excludeFromLearning'), false), d->>'reasons', d->>'notes',
      coalesce(core.uid(d->>'by'), core.uid(p_by)), coalesce(core.ts(d->'savedAt'), p_at));
    if jsonb_typeof(d->'runs') = 'array' and jsonb_array_length(d->'runs') > 0 then
      for r, n in select e, i from jsonb_array_elements(d->'runs') with ordinality as x(e, i) loop
        insert into core.production_runs (day_id, run_no, product_code, size, cartons, batches_prepared, opening_batches,
               closing_batches, fill_min, changeover_min, prep_only)
        values (p_id, n, core.p(r->>'product'), r->>'size', core.i(r->>'boxes'), core.num(r->>'batches'),
               core.num(r->>'opening'), core.num(r->>'closing'), core.i(r->>'fillMin'), core.i(r->>'changeoverMin'),
               coalesce(core.b(r->>'prepOnly'), false));
      end loop;
    elsif d ? 'product' then
      insert into core.production_runs (day_id, run_no, product_code, size, cartons, batches_prepared, opening_batches, closing_batches, fill_min)
      values (p_id, 1, core.p(d->>'product'), d->>'size', core.i(d->>'boxes'), core.num(d->>'batches'),
              core.num(d->>'openingBalance'), core.num(d->>'closingBalance'), core.i(d->>'fillMin'));
    end if;
    n := 0;
    for s in select btrim(x) from regexp_split_to_table(coalesce(d->>'reasons',''), '\s*;\s*') as x loop
      continue when s = '' or s !~ '\d\s*min';
      n := n + 1;
      insert into core.stops values (p_id, n,
        coalesce(nullif(btrim(regexp_replace(s, '[:\s–-]*\d+(\.\d+)?\s*min.*$', '')), ''), s),
        core.num(substring(s from '(\d+(?:\.\d+)?)\s*min')));
    end loop;

  -- ---------------- Line Planner forecasts ----------------
  elsif p_coll = 'plans' then
    delete from core.forecasts where id = p_id;
    if p_deleted or core.sec(d->>'sec') is null or core.dt(d->>'date') is null or d->'out' is null then return; end if;
    insert into core.forecasts values (
      p_id, core.dt(d->>'date'), core.sec(d->>'sec'), d->>'lot',
      core.i(d->'out'->>'boxesP10'), core.i(d->'out'->>'boxesP50'), core.i(d->'out'->>'boxesP90'),
      core.i(d->'out'->>'fillMin'), core.i(d->'out'->>'stopMin'), d->'out'->>'finish',
      case when jsonb_typeof(d->'why') = 'array'
           then (select string_agg(x, E'\n') from jsonb_array_elements_text(d->'why') x) end,
      coalesce(core.uid(d->>'by'), core.uid(p_by)), coalesce(core.ts(d->'savedAt'), p_at),
      jsonb_build_object('timeline', d->'out'->'timeline', 'stopByCat', d->'out'->'stopByCat', 'closing', d->'out'->'closing'));
    if jsonb_typeof(d->'out'->'runs') = 'array' then
      for r, n in select e, i from jsonb_array_elements(d->'out'->'runs') with ordinality as x(e, i) loop
        insert into core.forecast_runs values (p_id, n, core.p(r->>'product'), r->>'size', core.num(r->>'opening'),
          core.num(r->>'prepared'), core.num(r->>'closing'), core.i(r->>'boxesP50'), r->>'start', coalesce(r->>'end', r->>'finish'));
      end loop;
    end if;

  -- ---------------- Lab people (PINs are never copied) ----------------
  elsif p_coll = 'lab_people' then
    if p_deleted then update core.lab_people set active = false where uid = p_id; return; end if;
    -- key = the lab's own person id (what samples and results point to); user_id = their website login
    insert into core.lab_people values (p_id, d->>'name', d->>'role', core.b(d->>'active'),
      core.b(d->>'canTest'), core.b(d->>'canValidate'), core.uid(d->>'uid'))
    on conflict (uid) do update set name = excluded.name, role = excluded.role, active = excluded.active,
      can_test = excluded.can_test, can_validate = excluded.can_validate, user_id = excluded.user_id;

  -- ---------------- Lab setup: products, tests, solutions ----------------
  elsif p_coll = 'lab_config' and p_id = 'main' and not p_deleted then
    for prod in select e from jsonb_array_elements(coalesce(d->'products','[]'::jsonb)) e loop
      continue when prod->>'id' is null;
      insert into core.products values (prod->>'id', coalesce(prod->>'name', prod->>'id'), prod->>'standard', prod->>'category')
      on conflict (code) do update set name = excluded.name, standard = excluded.standard, category = excluded.category;
      for t, n in select e, i from jsonb_array_elements(coalesce(prod->'tests','[]'::jsonb)) with ordinality as x(e, i) loop
        continue when t->>'id' is null;
        insert into core.lab_tests values (prod->>'id', t->>'id', n, t->>'name', t->>'kind', t->>'method',
          t->'outputs'->0->>'unit', core.num(t->'outputs'->0->>'min'), core.num(t->'outputs'->0->>'max'),
          t->'outputs'->0->>'formula', t->>'perBatch', core.b(t->>'grouped'), core.i(t->>'incubDays'), t)
        on conflict (product_code, id) do update set test_no = excluded.test_no, name = excluded.name, kind = excluded.kind,
          method = excluded.method, unit = excluded.unit, min_value = excluded.min_value, max_value = excluded.max_value,
          formula = excluded.formula, done_for = excluded.done_for, grouped = excluded.grouped,
          incub_days = excluded.incub_days, definition = excluded.definition;
      end loop;
    end loop;
  elsif p_coll = 'lab_config' and p_id = 'solutions' and not p_deleted then
    for t in select e from jsonb_array_elements(coalesce(d->'list','[]'::jsonb)) e loop
      continue when t->>'id' is null;
      insert into core.lab_solutions values (t->>'id', t->>'name', t->>'chem', t->>'unit', core.num(t->>'nominal'), core.num(t->>'conc'))
      on conflict (id) do update set name = excluded.name, chemical = excluded.chemical, unit = excluded.unit,
        nominal = excluded.nominal, current_conc = excluded.current_conc;
      insert into core.lab_solution_history
        select t->>'id', core.ts(h->'at'), core.num(h->>'conc'), h->>'by'
        from jsonb_array_elements(coalesce(t->'history','[]'::jsonb)) h where core.ts(h->'at') is not null
        union select t->>'id', core.ts(t->'at'), core.num(t->>'conc'), t->>'by' where core.ts(t->'at') is not null
      on conflict do nothing;
    end loop;

  -- ---------------- Lab records ----------------
  elsif p_coll = 'lab_sessions' then
    if p_deleted then delete from core.lab_sessions where id = p_id; return; end if;
    insert into core.lab_sessions values (p_id, core.p(d->>'productId'), core.sec(d->>'section'),
      core.dt(d->>'date'), core.dt(d->>'prod'), core.dt(d->>'exp'), d->>'lot', nullif(d->>'tank',''), core.num(d->>'batches'),
      core.ts(d->'validated'->'at'), core.person(d->'validated'->>'by'),
      core.ts(d->'finalVal'->'at'), core.person(d->'finalVal'->>'by'),
      d->>'note', core.ts(d->'createdAt'), core.person(d->>'createdBy'))
    on conflict (id) do update set product_code = excluded.product_code, section_code = excluded.section_code,
      test_date = excluded.test_date, production_date = excluded.production_date, expiry_date = excluded.expiry_date,
      lot = excluded.lot, tank = excluded.tank, batches = excluded.batches,
      chem_validated_at = excluded.chem_validated_at, chem_validated_by = excluded.chem_validated_by,
      final_validated_at = excluded.final_validated_at, final_validated_by = excluded.final_validated_by,
      note = excluded.note, created_at = excluded.created_at, created_by = excluded.created_by;

  elsif p_coll = 'lab_samples' then
    delete from core.lab_samples where id = p_id;
    if p_deleted then return; end if;
    if d->>'sessionId' is not null then
      insert into core.lab_sessions (id, product_code) values (d->>'sessionId', core.p(d->>'productId')) on conflict do nothing;
    end if;
    insert into core.lab_samples values (p_id, d->>'sessionId', core.p(d->>'productId'), d->>'code', core.i(d->>'n'),
      nullif(d->>'batch',''), nullif(d->>'tank',''), core.dt(d->>'date'), core.dt(d->>'prod'), core.dt(d->>'exp'),
      d->>'pairOf', core.b(d->>'extra'), core.person(d->>'takenBy'), core.dt(d->>'microDate'), nullif(d->>'reason',''),
      core.ts(d->'createdAt'), core.person(d->>'createdBy'));
    if jsonb_typeof(d->'results') = 'object' then
      for k, v in select * from jsonb_each(d->'results') loop
        continue when jsonb_typeof(v) <> 'object';
        insert into core.lab_tests (product_code, id, name) values (core.p(d->>'productId'), k, k) on conflict do nothing;
        insert into core.lab_results values (p_id, d->>'productId', k, v->'in',
          case when jsonb_typeof(v->'in') = 'object' and (select count(*) from jsonb_object_keys(v->'in')) = 1
               then core.num((select x from jsonb_each_text(v->'in') as j(y, x) limit 1)) end,
          v->>'value', core.ts(v->'at'), core.person(v->>'by'), core.b(v->>'late'));
      end loop;
    end if;

  elsif p_coll = 'lab_daybatch' then
    delete from core.lab_day_batches where day = core.dt(p_id);
    if p_deleted or core.dt(p_id) is null then return; end if;
    for k, v in select * from jsonb_each(coalesce(d->'items','{}'::jsonb)) loop
      continue when core.sec(split_part(k,'|',2)) is null;
      insert into core.lab_day_batches values (core.dt(p_id), core.p(split_part(k,'|',1)), core.sec(split_part(k,'|',2)), core.num(v #>> '{}'));
    end loop;

  elsif p_coll = 'lab_activity' then
    delete from core.lab_activity where id = p_id;
    if not p_deleted then
      insert into core.lab_activity values (p_id, core.ts(d->'at'), d->>'by', regexp_replace(coalesce(d->>'txt',''), '<[^>]+>', '', 'g'));
    end if;

  -- ---------------- Team feed ----------------
  elsif p_coll = 'team' then
    delete from core.team_posts where id = p_id;
    if not p_deleted then
      insert into core.team_posts values (p_id, coalesce(core.ts(d->'at'), p_at), core.uid(d->>'by'), d->>'byName', d->>'ch', d->>'text');
    end if;
  end if;
  -- other drawers (config, backup, lab_presence, res_* research) stay as JSON on purpose
end $$;

-- =====================================================================
-- Translator 2: app_docs (the big shared files)
-- =====================================================================
create function core.sync_app(p_name text, d jsonb) returns void language plpgsql as $$
declare
  r jsonb; k text; v jsonb; k2 text; v2 jsonb; k3 text; v3 jsonb; rid bigint; n int; okey text; h jsonb;
begin
  if p_name = 'baseline' then
    for r in select e from jsonb_array_elements(coalesce(d->'materials','[]'::jsonb)) e loop
      continue when r->>'id' is null;
      insert into core.materials values (r->>'id', coalesce(r->>'name', r->>'id'), r->>'unit', r->>'recipeUnit',
        core.num(r->>'recipeFactor'), core.i(r->>'leadMinDays'), core.i(r->>'leadMaxDays'), core.num(r->>'safetyWeeks'),
        core.num(r->>'orderCoverWeeks'), r->>'orderVia', nullif(r->>'note',''))
      on conflict (code) do nothing;            -- the materials file below has the final say
    end loop;
    for r in select e from jsonb_array_elements(coalesce(d->'products','[]'::jsonb)) e loop
      continue when r->>'id' is null;
      insert into core.products (code, name) values (r->>'id', coalesce(r->>'name', r->>'id')) on conflict (code) do nothing;
    end loop;

  elsif p_name = 'materials' then
    for r in select e from jsonb_array_elements(coalesce(d->'extra','[]'::jsonb)) e loop
      continue when r->>'id' is null;
      insert into core.materials values (r->>'id', coalesce(r->>'name', r->>'id'), r->>'unit', r->>'recipeUnit',
        core.num(r->>'recipeFactor'), core.i(r->>'leadMinDays'), core.i(r->>'leadMaxDays'), core.num(r->>'safetyWeeks'),
        core.num(r->>'orderCoverWeeks'), r->>'orderVia', nullif(r->>'note',''))
      on conflict (code) do update set name = excluded.name, unit = excluded.unit, recipe_unit = excluded.recipe_unit,
        recipe_factor = excluded.recipe_factor, lead_min_days = excluded.lead_min_days, lead_max_days = excluded.lead_max_days,
        safety_weeks = excluded.safety_weeks, order_cover_weeks = excluded.order_cover_weeks,
        order_via = excluded.order_via, note = excluded.note;
    end loop;
    for k, v in select * from jsonb_each(coalesce(d->'items','{}'::jsonb)) loop
      perform core.m(k);
      update core.materials set
        name              = coalesce(v->>'name', name),
        unit              = coalesce(v->>'unit', unit),
        recipe_unit       = coalesce(v->>'recipeUnit', recipe_unit),
        recipe_factor     = coalesce(core.num(v->>'recipeFactor'), recipe_factor),
        lead_min_days     = coalesce(core.i(v->>'leadMinDays'), lead_min_days),
        lead_max_days     = coalesce(core.i(v->>'leadMaxDays'), lead_max_days),
        safety_weeks      = coalesce(core.num(v->>'safetyWeeks'), safety_weeks),
        order_cover_weeks = coalesce(core.num(v->>'orderCoverWeeks'), order_cover_weeks),
        order_via         = coalesce(nullif(v->>'orderVia',''), order_via),
        note              = coalesce(nullif(v->>'note',''), note)
      where code = k;
    end loop;

  elsif p_name = 'recipes' then
    delete from core.recipes;
    -- standard recipes: recipes.{product}.{SEC-x}.{material} = qty per batch
    for k, v in select * from jsonb_each(coalesce(d->'recipes','{}'::jsonb)) loop
      for k2, v2 in select * from jsonb_each(v) loop
        continue when core.sec(k2) is null or jsonb_typeof(v2) <> 'object';
        insert into core.recipes (product_code, section_code, variant, name)
          values (core.p(k), core.sec(k2), 'standard', coalesce(d->'names'->>k, 'Standard')) returning id into rid;
        for k3, v3 in select * from jsonb_each(v2) loop
          continue when core.num(v3 #>> '{}') is null;
          insert into core.recipe_lines values (rid, core.m(k3), core.num(v3 #>> '{}'));
        end loop;
      end loop;
    end loop;
    -- variants: variants.{product}.{variant}.{SEC-x}.{material}
    for k, v in select * from jsonb_each(coalesce(d->'variants','{}'::jsonb)) loop
      for k2, v2 in select * from jsonb_each(v) loop
        for k3, v3 in select * from jsonb_each(v2) loop
          continue when core.sec(k3) is null or jsonb_typeof(v3) <> 'object';
          insert into core.recipes (product_code, section_code, variant, name)
            values (core.p(k), core.sec(k3), k2, v2->>'name') returning id into rid;
          insert into core.recipe_lines
            select rid, core.m(x.key), core.num(x.value #>> '{}') from jsonb_each(v3) x where core.num(x.value #>> '{}') is not null;
        end loop;
      end loop;
    end loop;
    delete from core.recipe_changes;
    for r in select e from jsonb_array_elements(coalesce(d->'log','[]'::jsonb)) e loop
      continue when r->>'id' is null;
      insert into core.recipe_changes values (r->>'id', core.p(r->>'product'), core.sec(r->>'section'), core.dt(r->>'date'),
        core.i(r->>'batch'), r->>'from', r->>'to', r->>'why', core.b(r->>'confirmed'), core.ts(r->'at'))
      on conflict do nothing;
    end loop;

  elsif p_name = 'plan' then
    delete from core.plan_runs;
    for r, n in select e, i from jsonb_array_elements(coalesce(d->'runs','[]'::jsonb)) with ordinality as x(e, i) loop
      insert into core.plan_runs values (n, core.p(r->>'product'), r->>'size', core.sec(r->>'lines'),
        core.dt(r->>'from'), core.dt(r->>'to'), core.num(r->>'batches'), core.i(r->>'cartons'),
        nullif(r->>'recipe',''), nullif(r->>'note',''),
        nullif(jsonb_strip_nulls(jsonb_build_object('batches', r->'dayBatches', 'cartons', r->'dayCartons')), '{}'::jsonb));
    end loop;
    delete from core.recipe_days;
    for k, v in select * from jsonb_each(coalesce(d->'recipeOf','{}'::jsonb)) loop
      for k2, v2 in select * from jsonb_each(v) loop
        continue when core.dt(k) is null or core.sec(split_part(k2,'|',2)) is null or coalesce(v2 #>> '{}','') = '';
        insert into core.recipe_days values (core.dt(k), core.p(split_part(k2,'|',1)), core.sec(split_part(k2,'|',2)), v2 #>> '{}')
        on conflict do nothing;
      end loop;
    end loop;

  elsif p_name = 'stock' then
    for h in select e->'prev' from jsonb_array_elements(coalesce(d->'history','[]'::jsonb)) e
             union all select d->'items' loop
      continue when jsonb_typeof(h) <> 'object';
      for k, v in select * from jsonb_each(h) loop
        continue when core.dt(v->>'asOf') is null;
        insert into core.stock_counts values (core.m(k), core.dt(v->>'asOf'), core.num(v->>'qty'), v->>'source')
        on conflict (material_code, as_of) do update set qty = excluded.qty, source = excluded.source;
      end loop;
    end loop;

  elsif p_name = 'orders' then
    delete from core.purchase_orders;
    for r in select e from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) e loop
      continue when r->>'material' is null;
      okey := coalesce(substring(r->>'ref' from 'P\d{4,}'), 'X' || left(md5(coalesce(r->>'ref','') || coalesce(r->>'added','')), 8)) || '|' || (r->>'material');
      insert into core.purchase_orders values (okey, substring(r->>'ref' from 'P\d{4,}'),
        nullif(btrim(split_part(r->>'ref', ' · ', 2)), ''), core.m(r->>'material'), core.num(r->>'qty'), core.dt(r->>'eta'),
        r->>'status', r->>'source', nullif(r->>'note',''), core.dt(r->>'added'))
      on conflict (id) do nothing;
      insert into core.order_receipts
        select okey, i, core.dt(x->>'date'), core.num(x->>'qty'), core.b(x->>'inCount'), nullif(x->>'note','')
        from jsonb_array_elements(coalesce(r->'receipts','[]'::jsonb)) with ordinality as y(x, i)
      on conflict do nothing;
    end loop;
  end if;
  -- settings, alerts, supply, inventory and the rest of baseline stay as JSON on purpose
end $$;

-- ---------- safe wrappers: never block a save ----------------------------
create function core.safe_sync_planner(p_coll text, p_id text, d jsonb, p_by text, p_at timestamptz, p_deleted boolean)
returns boolean language plpgsql as $$
begin
  perform core.sync_planner(p_coll, p_id, d, p_by, p_at, p_deleted);
  return true;
exception when others then
  begin insert into core.sync_errors(source, doc_key, error) values ('planner_docs', p_coll || '/' || p_id, sqlerrm);
  exception when others then null; end;
  return false;
end $$;

create function core.safe_sync_app(p_name text, d jsonb) returns boolean language plpgsql as $$
begin
  perform core.sync_app(p_name, d);
  return true;
exception when others then
  begin insert into core.sync_errors(source, doc_key, error) values ('app_docs', p_name, sqlerrm);
  exception when others then null; end;
  return false;
end $$;

create function core.on_planner_change() returns trigger language plpgsql security definer set search_path = core, public as $$
begin
  if tg_op = 'DELETE' then
    perform core.safe_sync_planner(old.coll, old.id, old.data, null, null, true);
  else
    perform core.safe_sync_planner(new.coll, new.id, new.data, new.saved_by::text, new.saved_at, false);
  end if;
  return null;
exception when others then return null;
end $$;

create function core.on_app_change() returns trigger language plpgsql security definer set search_path = core, public as $$
begin
  if tg_op <> 'DELETE' then perform core.safe_sync_app(new.name, new.data); end if;
  return null;
exception when others then return null;
end $$;

-- ---------- ready-made views for reports / Power BI ----------------------
create view core.v_daily_production as
  select d.day, d.section_code as section, r.product_code as product, p.name as product_name, r.size, d.lot,
         r.cartons, r.batches_prepared, r.batches_used, r.prep_only, d.fill_min, d.stop_min, d.work_min
  from core.production_days d
  join core.production_runs r on r.day_id = d.id
  left join core.products p on p.code = r.product_code;

create view core.v_stop_reasons as
  select d.day, d.section_code as section, s.reason, s.minutes
  from core.stops s join core.production_days d on d.id = s.day_id;

create view core.v_material_use as         -- materials consumed = batches prepared × the recipe used that day
  select d.day, d.section_code as section, r.product_code as product, coalesce(rd.variant, 'standard') as recipe,
         l.material_code as material, m.name as material_name, m.recipe_unit as unit,
         sum(r.batches_prepared * l.qty_per_batch) as qty
  from core.production_days d
  join core.production_runs r on r.day_id = d.id and coalesce(r.batches_prepared, 0) > 0
  left join core.recipe_days rd on rd.day = d.day and rd.product_code = r.product_code and rd.section_code = d.section_code
  join core.recipes rc on rc.product_code = r.product_code and rc.section_code = d.section_code
                      and rc.variant = coalesce(rd.variant, 'standard')
  join core.recipe_lines l on l.recipe_id = rc.id
  left join core.materials m on m.code = l.material_code
  group by 1, 2, 3, 4, 5, 6, 7;

create view core.v_lab_results as
  select ss.test_date, ss.lot, s.product_code as product, ss.section_code as section, s.code as sample, s.batch,
         t.name as test, t.kind, res.input_value, res.text_value, t.unit, t.min_value, t.max_value,
         case when res.input_value is null or t.formula is distinct from 'x' then null
              when (t.min_value is not null and res.input_value < t.min_value)
                or (t.max_value is not null and res.input_value > t.max_value) then 'out of range' else 'ok' end as check_raw,
         lp.name as entered_by, res.entered_at, ss.final_validated_at is not null as validated
  from core.lab_results res
  join core.lab_samples s on s.id = res.sample_id
  left join core.lab_sessions ss on ss.id = s.session_id
  left join core.lab_tests t on t.product_code = res.product_code and t.id = res.test_id
  left join core.lab_people lp on lp.uid = res.entered_by;

create view core.v_stock_latest as
  select distinct on (c.material_code) c.material_code as material, m.name, c.qty, m.unit, c.as_of, c.source
  from core.stock_counts c left join core.materials m on m.code = c.material_code
  order by c.material_code, c.as_of desc;

-- ---------- fill everything from what is already saved -------------------
select core.safe_sync_app(name, data) from public.app_docs
  order by case name when 'baseline' then 0 when 'materials' then 1 when 'recipes' then 2 else 3 end;
select core.safe_sync_planner(coll, id, data, saved_by::text, saved_at, false) from public.planner_docs
  order by case coll when 'lab_people' then 0 when 'lab_config' then 1 when 'lab_sessions' then 2 when 'lab_samples' then 3 else 4 end, id;

-- ---------- from now on: every save is translated automatically ----------
create trigger core_sync after insert or update or delete on public.planner_docs
  for each row execute function core.on_planner_change();
create trigger core_sync after insert or update on public.app_docs
  for each row execute function core.on_app_change();

-- ---------- result ---------------------------------------------------------
select 'tables' as what, count(*)::text as n from information_schema.tables where table_schema = 'core' and table_type = 'BASE TABLE'
union all select 'sync errors', count(*)::text from core.sync_errors;
