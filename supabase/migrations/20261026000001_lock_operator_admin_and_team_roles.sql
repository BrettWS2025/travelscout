-- ============================================================================
-- Security S3: Lock operator admin fields and team role escalation
-- ============================================================================
-- Pattern (same as S2): BEFORE INSERT/UPDATE/DELETE triggers. Client roles
-- (anon / authenticated) cannot change admin-owned operator columns or escalate
-- team roles via PostgREST even if they bypass the Next.js API.
-- Only PostgREST `service_role` (and postgres / supabase_admin for migrations and
-- SECURITY DEFINER writers) may change locked fields without these checks.
--
-- Trigger functions stay INVOKER so `current_user` reflects the PostgREST role
-- (authenticated vs service_role). Count/existence helpers are SECURITY DEFINER
-- so bootstrap / last-owner checks are not blind under RLS.
--
-- marketplace.operators:
--   account_status, requires_manual_review — platform-admin / service-role only
--
-- marketplace.team_members:
--   only accepted owners may set role = 'owner'
--   first-owner bootstrap (no accepted members yet) still allowed
--   last accepted owner cannot be demoted, revoked, or deleted
--
-- marketplace.organization_members (legacy):
--   only org owners may set role = 'owner'
--   last owner cannot be demoted or deleted
--
-- App paths (profile strip, team.ts owner checks, ensureAcceptedOwner, admin
-- manual-review / account close) remain; persist admin field changes and any
-- bypass of these rules via a service-role client when leaving in-memory stores.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER — accurate counts under RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.team_accepted_owner_count(
  op_id UUID,
  exclude_member_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM marketplace.team_members m
  WHERE m.operator_id = op_id
    AND m.role = 'owner'
    AND m.invite_status = 'accepted'
    AND (exclude_member_id IS NULL OR m.id IS DISTINCT FROM exclude_member_id);
$$;

CREATE OR REPLACE FUNCTION marketplace.team_has_accepted_member(op_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM marketplace.team_members m
    WHERE m.operator_id = op_id
      AND m.invite_status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION marketplace.org_owner_count(
  org_id UUID,
  exclude_member_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM marketplace.organization_members m
  WHERE m.organization_id = org_id
    AND m.role = 'owner'
    AND (exclude_member_id IS NULL OR m.id IS DISTINCT FROM exclude_member_id);
$$;

CREATE OR REPLACE FUNCTION marketplace.is_org_owner(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = marketplace, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM marketplace.organization_members m
    WHERE m.organization_id = org_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'owner'
  );
$$;

COMMENT ON FUNCTION marketplace.team_accepted_owner_count(UUID, UUID) IS
  'S3: count accepted owners for an operator (bypasses RLS)';
COMMENT ON FUNCTION marketplace.team_has_accepted_member(UUID) IS
  'S3: whether the operator has any accepted team member (bypasses RLS)';
COMMENT ON FUNCTION marketplace.org_owner_count(UUID, UUID) IS
  'S3: count organization owners (bypasses RLS)';
COMMENT ON FUNCTION marketplace.is_org_owner(UUID) IS
  'S3: true when the current user is an owner of the organization';

-- ---------------------------------------------------------------------------
-- operators: admin-only columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.enforce_operator_admin_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.account_status IS DISTINCT FROM 'pending_verification'
       OR NEW.requires_manual_review IS DISTINCT FROM false
    THEN
      RAISE EXCEPTION
        'marketplace.operators admin columns (account_status, requires_manual_review) can only be set by service_role'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.requires_manual_review IS DISTINCT FROM OLD.requires_manual_review
  THEN
    RAISE EXCEPTION
      'marketplace.operators admin columns (account_status, requires_manual_review) can only be changed by service_role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION marketplace.enforce_operator_admin_columns() IS
  'S3: block authenticated/anon from setting account_status / requires_manual_review on operators';

DROP TRIGGER IF EXISTS marketplace_operators_enforce_admin_columns
  ON marketplace.operators;
CREATE TRIGGER marketplace_operators_enforce_admin_columns
  BEFORE INSERT OR UPDATE ON marketplace.operators
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.enforce_operator_admin_columns();

-- ---------------------------------------------------------------------------
-- team_members: owner role + last accepted owner
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.enforce_team_member_role_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_operator_id UUID;
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' AND OLD.invite_status = 'accepted' THEN
      IF marketplace.team_accepted_owner_count(OLD.operator_id, OLD.id) < 1 THEN
        RAISE EXCEPTION
          'marketplace.team_members: cannot remove the last accepted owner'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  v_operator_id := NEW.operator_id;

  -- Setting or keeping role = owner requires an accepted owner actor, except
  -- first-owner bootstrap (no accepted members yet; self as accepted owner).
  IF NEW.role = 'owner'
     AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'owner')
  THEN
    IF marketplace.is_operator_owner(v_operator_id) THEN
      NULL; -- allowed
    ELSIF TG_OP = 'INSERT'
      AND v_uid IS NOT NULL
      AND NEW.user_id = v_uid
      AND NEW.invite_status = 'accepted'
      AND NOT marketplace.team_has_accepted_member(v_operator_id)
    THEN
      NULL; -- first-owner bootstrap
    ELSE
      RAISE EXCEPTION
        'marketplace.team_members: only owners may set role = owner'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Demoting / revoking an accepted owner: only owners, and not the last one.
  IF TG_OP = 'UPDATE'
     AND OLD.role = 'owner'
     AND OLD.invite_status = 'accepted'
     AND (
       NEW.role IS DISTINCT FROM 'owner'
       OR NEW.invite_status IS DISTINCT FROM 'accepted'
     )
  THEN
    IF NOT marketplace.is_operator_owner(v_operator_id) THEN
      RAISE EXCEPTION
        'marketplace.team_members: only owners may change or remove owners'
        USING ERRCODE = '42501';
    END IF;

    IF marketplace.team_accepted_owner_count(v_operator_id, OLD.id) < 1 THEN
      RAISE EXCEPTION
        'marketplace.team_members: cannot demote or revoke the last accepted owner'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Non-owners must not change invite_status on owner rows.
  IF TG_OP = 'UPDATE'
     AND OLD.role = 'owner'
     AND NEW.role = 'owner'
     AND OLD.invite_status IS DISTINCT FROM NEW.invite_status
     AND NOT marketplace.is_operator_owner(v_operator_id)
  THEN
    RAISE EXCEPTION
      'marketplace.team_members: only owners may change or remove owners'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION marketplace.enforce_team_member_role_rules() IS
  'S3: only owners may grant owner role; last accepted owner cannot be removed';

DROP TRIGGER IF EXISTS marketplace_team_members_enforce_role_rules
  ON marketplace.team_members;
CREATE TRIGGER marketplace_team_members_enforce_role_rules
  BEFORE INSERT OR UPDATE OR DELETE ON marketplace.team_members
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.enforce_team_member_role_rules();

-- ---------------------------------------------------------------------------
-- organization_members (legacy): owner role + last owner
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION marketplace.enforce_organization_member_role_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      IF marketplace.org_owner_count(OLD.organization_id, OLD.id) < 1 THEN
        RAISE EXCEPTION
          'marketplace.organization_members: cannot remove the last owner'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  v_org_id := NEW.organization_id;

  IF NEW.role = 'owner'
     AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'owner')
  THEN
    IF marketplace.is_org_owner(v_org_id) THEN
      NULL;
    ELSIF TG_OP = 'INSERT'
      AND (SELECT auth.uid()) IS NOT NULL
      AND NEW.user_id = (SELECT auth.uid())
      AND marketplace.org_owner_count(v_org_id, NULL) < 1
    THEN
      NULL; -- first-owner bootstrap (creator path usually bypasses as postgres)
    ELSE
      RAISE EXCEPTION
        'marketplace.organization_members: only owners may set role = owner'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.role = 'owner'
     AND NEW.role IS DISTINCT FROM 'owner'
  THEN
    IF NOT marketplace.is_org_owner(v_org_id) THEN
      RAISE EXCEPTION
        'marketplace.organization_members: only owners may change or remove owners'
        USING ERRCODE = '42501';
    END IF;

    IF marketplace.org_owner_count(v_org_id, OLD.id) < 1 THEN
      RAISE EXCEPTION
        'marketplace.organization_members: cannot demote the last owner'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION marketplace.enforce_organization_member_role_rules() IS
  'S3: only org owners may grant owner role; last owner cannot be removed';

DROP TRIGGER IF EXISTS marketplace_organization_members_enforce_role_rules
  ON marketplace.organization_members;
CREATE TRIGGER marketplace_organization_members_enforce_role_rules
  BEFORE INSERT OR UPDATE OR DELETE ON marketplace.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION marketplace.enforce_organization_member_role_rules();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION marketplace.enforce_operator_admin_columns()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.enforce_team_member_role_rules()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.enforce_organization_member_role_rules()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.team_accepted_owner_count(UUID, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.team_has_accepted_member(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.org_owner_count(UUID, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION marketplace.is_org_owner(UUID)
  TO authenticated, service_role;
