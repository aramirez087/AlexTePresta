# Google OAuth Setup

This document describes how to enable Google Sign-In for AlexTePresta. All credentials are entered
into the Supabase Dashboard — **no client IDs or secrets belong in application code**.

## Prerequisites

- A Google Cloud project with billing enabled
- Access to the Supabase Dashboard for this project
- The app deployed (or running locally at `http://localhost:3000`)

---

## Step 1 — Create a Google OAuth 2.0 Client

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services → Credentials**.
3. Click **Create Credentials → OAuth 2.0 Client ID**.
4. Application type: **Web application**.
5. Name: `AlexTePresta` (or any descriptive name).
6. Under **Authorized redirect URIs**, add:
   - Local: `http://127.0.0.1:54321/auth/v1/callback`
   - Production: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`

   > This is the URL that **Google** redirects to after authorization — it is the Supabase Auth endpoint,
   > not the Next.js app. Supabase then redirects to the app's `/auth/callback`.

7. Click **Create**. Note the **Client ID** and **Client Secret**.

---

## Step 2 — Enable Google Provider in Supabase

1. Open the Supabase Dashboard for your project.
2. Go to **Authentication → Providers → Google**.
3. Toggle **Enable Sign in with Google**.
4. Paste the **Client ID** and **Client Secret** from Step 1.
5. Save.

---

## Step 3 — Configure Allowed Redirect URLs in Supabase

1. In the Supabase Dashboard, go to **Authentication → URL Configuration**.
2. Set **Site URL**:
   - Local: `http://localhost:3000`
   - Production: `https://<your-vercel-url>`
3. Under **Redirect URLs** (allowed list), add:
   - `http://localhost:3000/auth/callback`
   - `https://<your-vercel-url>/auth/callback`

   > Supabase validates that the `redirectTo` parameter in `signInWithOAuth()` matches this allowlist.
   > If the URL is absent, the OAuth flow will fail silently.

---

## Step 4 — Local development environment variables

Copy `.env.local.example` to `.env.local` and confirm the following values are present:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from npx supabase status>
SUPABASE_SERVICE_ROLE_KEY=<local service role key from npx supabase status>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The Google OAuth Client ID and Client Secret are configured **only in the Supabase Dashboard**, not
in `.env.local`. The Next.js application only reads `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## Step 5 — Local Supabase Google OAuth (optional)

The local Supabase stack does not connect to Google's servers by default. For end-to-end local
testing with real Google OAuth:

1. Run `npx supabase start` to get the local auth endpoint.
2. In `supabase/config.toml`, under `[auth.external.google]`, set:
   ```toml
   [auth.external.google]
   enabled = true
   client_id = "env(GOOGLE_OAUTH_CLIENT_ID)"
   secret = "env(GOOGLE_OAUTH_CLIENT_SECRET)"
   ```
3. Add to `.env.local`:
   ```env
   GOOGLE_OAUTH_CLIENT_ID=<client id>
   GOOGLE_OAUTH_CLIENT_SECRET=<client secret>
   ```
4. Add `http://127.0.0.1:54321/auth/v1/callback` to the authorized redirect URIs in Google Cloud Console.
5. Restart the local Supabase stack: `npx supabase stop && npx supabase start`.

---

## Scopes

The app requests these OAuth scopes:
- `openid` — required for OIDC
- `email` — used to match invite email
- `profile` — provides display name

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| `redirect_uri_mismatch` | The Supabase project's callback URL is missing from Google Cloud authorized URIs |
| OAuth completes but user lands on `/login?error=auth_failed` | Code exchange failed — check Supabase logs |
| Invite accepted but role shows wrong | The `accept_invite` function ran but public.users row not found — verify the service role key is set |
| `Redirect URL not allowed` (Supabase error) | The app's `/auth/callback` is not in the Supabase redirect allowlist |
