-- Seed: local development admin user
-- For local dev only. Production admin is created via Google OAuth first sign-in.
DO $$
DECLARE
  admin_id   uuid := '00000000-0000-0000-0000-000000000001';
  admin_email text := 'alexramirez.cr@gmail.com';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = admin_id) THEN
    INSERT INTO auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud
    ) VALUES (
      admin_id,
      admin_email,
      crypt('AdminDev123!', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      false,
      'authenticated',
      'authenticated'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = admin_id) THEN
    INSERT INTO public.users (id, email, role)
    VALUES (admin_id, admin_email, 'admin');
  END IF;
END $$;
