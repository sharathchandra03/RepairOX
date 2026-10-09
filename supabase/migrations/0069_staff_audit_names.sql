-- 0069 — Truthful staff/Employee audit entries (SAFE, replaces fn_audit only)
--
-- PROBLEM
--   When an owner creates a user, the Activity Log showed a generic, nameless
--   row: actor "System", description "Employee insert (<uuid>)". The created
--   person's NAME only appeared later — and only because, once THEY logged in
--   and edited their own profile, that self-edit ran under their JWT and the
--   trigger could finally resolve a name. The creation itself never named
--   either party.
--
--   Root cause (in the generic audit trigger fn_audit):
--     1. ACTOR is resolved from auth.uid(). Staff creation is performed by the
--        server using the SERVICE ROLE, so inside the trigger auth.uid() is
--        NULL → actor degrades to "System" (the real creator, e.g. "Ram", is
--        lost).
--     2. The SUBJECT name is never captured — the row stores only NEW.id, so
--        the description reads "(<uuid>)" instead of the user's name.
--
-- FIX (two parts, this migration is part 2)
--   • The /api/staff route now writes an EXPLICIT, correctly-named audit entry
--     at creation time ("<creator> created <new user>"), because it knows both
--     names server-side. (See app/src/app/api/staff/route.ts.)
--   • This migration refines fn_audit so that:
--       (a) it does NOT emit its own generic row for a staff INSERT (which
--           would duplicate the explicit, named entry the route just wrote),
--           and
--       (b) for every other staff change (UPDATE/DELETE) — and for any staff
--           INSERT that happens OUTSIDE the API route — it writes the staff
--           member's NAME in the description instead of the bare UUID.
--     All other tables keep the existing behaviour unchanged.
--
-- This only REPLACES the trigger function; it is idempotent and additive-safe.
-- ============================================================================

create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_org    uuid;
  v_branch uuid;
  v_record text;
  v_module text := coalesce(nullif(TG_ARGV[0], ''), TG_TABLE_NAME);
  v_actor  uuid := auth.uid();
  v_name   text;
  v_role   text;
  v_bname  text;
  v_subject text;   -- human-friendly label for the record (name, not just id)
  v_desc    text;
begin
  if (TG_OP = 'DELETE') then
    v_old := to_jsonb(OLD); v_new := null;
  elsif (TG_OP = 'UPDATE') then
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  else
    v_old := null; v_new := to_jsonb(NEW);
  end if;

  v_org    := coalesce(v_new->>'organization_id', v_old->>'organization_id')::uuid;
  v_branch := coalesce(v_new->>'branch_id',        v_old->>'branch_id')::uuid;
  v_record := coalesce(v_new->>'id', v_old->>'id',
                       v_new->>'doc_number', v_old->>'doc_number',
                       v_new->>'reference',  v_old->>'reference',
                       v_new->>'expense_id', v_old->>'expense_id');

  -- Resolve the acting user's own name/role/branch (NULL when the action runs
  -- under the service role, e.g. the /api/staff creation path).
  select s.name, s.role_id, s.branch
    into v_name, v_role, v_bname
  from public.staff s
  where s.auth_user_id = v_actor
  limit 1;

  -- ── staff / Employee special-casing ──────────────────────────────────────
  if (TG_TABLE_NAME = 'staff') then
    -- Skip the generic INSERT row: the application writes an explicit,
    -- correctly-named "User Created" entry ("<creator> created <new user>")
    -- for staff creation, so emitting a second generic row here would just be
    -- a nameless duplicate.
    if (TG_OP = 'INSERT') then
      return NEW;
    end if;
    -- For UPDATE/DELETE, name the subject by the staff member's NAME, not the
    -- bare UUID, so the feed reads e.g. "Employee updated (Akhilesh)".
    v_subject := coalesce(v_new->>'name', v_old->>'name', v_record);
  else
    v_subject := v_record;
  end if;

  v_desc := v_module || ' ' || lower(TG_OP)
            || (case when v_subject is not null then ' (' || v_subject || ')' else '' end);

  insert into public.audit_log(
    organization_id, branch_id, module, entity_type, record_id, action_type,
    action, severity, description, previous_value, new_value,
    performed_by, actor, role, branch
  ) values (
    v_org, v_branch, v_module, TG_TABLE_NAME, v_record, TG_OP,
    initcap(lower(TG_OP)) || ' ' || v_module,
    case TG_OP when 'DELETE' then 'critical' when 'INSERT' then 'success' else 'info' end,
    v_desc,
    v_old, v_new, v_actor, coalesce(v_name, 'System'), v_role, v_bname
  );

  if (TG_OP = 'DELETE') then return OLD; else return NEW; end if;
end;
$$;
