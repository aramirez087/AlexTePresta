-- Migration 0003: Atomic invite acceptance function
-- Called via admin client (service_role) to accept an invite in a single transaction

CREATE OR REPLACE FUNCTION public.accept_invite(
  p_token text,
  p_user_id uuid,
  p_email text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite invites%ROWTYPE;
BEGIN
  -- Lock the invite row to prevent concurrent double-acceptance
  SELECT * INTO v_invite
  FROM public.invites
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_not_found');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_expired');
  END IF;

  IF v_invite.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_consumed');
  END IF;

  IF lower(v_invite.email) != lower(p_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  INSERT INTO public.users (id, email, role, invited_by)
  VALUES (p_user_id, p_email, 'debtor', v_invite.inviter_id)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = 'debtor',
    invited_by = EXCLUDED.invited_by;

  UPDATE public.invites
  SET consumed_at = now()
  WHERE id = v_invite.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Only service_role may call this function; revoke from PUBLIC and anon
REVOKE ALL ON FUNCTION public.accept_invite(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite(text, uuid, text) TO service_role;
