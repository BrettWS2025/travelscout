# Operator subdomain setup

TravelScout serves the **traveler site** on the main domain and the **operator portal** on a subdomain (for example `operators.travelscout.co.nz`). Both use the same Next.js app and the same Supabase Auth project.

## What you configure once

### 1. Environment variable

Set this in **Vercel** (Production and Preview) and in local `.env.local`:

```bash
NEXT_PUBLIC_OPERATOR_HOST=operators.travelscout.co.nz
```

Until this is set, `/operator` continues to work on the main site (no redirect). After it is set, `/operator/*` on the main domain redirects to the subdomain.

### 2. DNS

At your DNS provider, add a record pointing the subdomain to Vercel:

| Type  | Name       | Value                    |
|-------|------------|--------------------------|
| CNAME | `operators` | `cname.vercel-dns.com` |

(Use the exact target Vercel shows when you add the domain in the project.)

### 3. Vercel domains

1. Open the TravelScout project → **Settings → Domains**.
2. Add `operators.travelscout.co.nz` (same project as the main site).
3. Wait for DNS verification.

No separate deployment is required: middleware routes by `Host`.

### 4. Supabase Auth redirect URLs

In **Supabase → Authentication → URL configuration**:

- Keep your main **Site URL** (for example `https://travelscout.co.nz`).
- Under **Redirect URLs**, add (adjust host if you use a different subdomain):

```
https://operators.travelscout.co.nz/**
https://travelscout.co.nz/**
http://operators.localhost:3000/**
http://localhost:3000/**
```

This allows sign-in, sign-up, and password reset on both hosts.

Optional: enable **Leaked password protection** in Auth settings (recommended for prod and dev).

## Local development

1. Add to `.env.local`:

   ```bash
   NEXT_PUBLIC_OPERATOR_HOST=operators.localhost
   ```

2. Run `npm run dev`.

3. Open:

   - Traveler site: `http://localhost:3000`
   - Operator portal: `http://operators.localhost:3000`

   (`operators.localhost` resolves to `127.0.0.1` on most systems without editing `/etc/hosts`.)

## Behavior summary

| Location | URL |
|----------|-----|
| Operator dashboard | `https://operators.travelscout.co.nz/` |
| Create org | `https://operators.travelscout.co.nz/organizations/new` |
| Main site operator link | Footer → **For operators** |
| Old path on main site | `https://travelscout.co.nz/operator/...` → 308 redirect to subdomain |

Operator access is still enforced by Supabase login and `marketplace.organization_members` (API layer), not by a separate auth provider.

## Preview deployments

For Vercel preview URLs, either:

- Set `NEXT_PUBLIC_OPERATOR_HOST` per environment to a stable staging subdomain (for example `operators-dev.travelscout.co.nz`), or
- Leave it unset on previews so operators use `/operator` on the preview hostname for testing.
