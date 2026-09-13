# Operator subdomain setup (GoDaddy + Vercel)

TravelScout serves the **traveler site** on the main domain and the **operator portal** on a subdomain:

- Traveler: `https://travelscout.co.nz`
- Operators: `https://operators.travelscout.co.nz`

Both use the **same** Next.js project on Vercel and the **same** Supabase Auth project. You only add DNS + one env var + Auth redirect URLs.

Do the steps in this order.

---

## Part A — Vercel (add the domain + copy the CNAME target)

### A1. Open Domains for the TravelScout project

1. Go to [https://vercel.com/dashboard](https://vercel.com/dashboard) and sign in.
2. Click your **TravelScout** project (the one that already serves `travelscout.co.nz`).
3. Top tabs: click **Settings**.
4. Left sidebar: click **Domains**.

### A2. Add the operator subdomain

1. On the Domains page, click **Add**.
2. Enter exactly:

   ```text
   operators.travelscout.co.nz
   ```

3. Confirm / save (leave it attached to **this same project** — do not create a second project).

### A3. Copy the DNS instructions Vercel shows

On the domain card for `operators.travelscout.co.nz`, Vercel will show something like:

| Type  | Name        | Value (example — use yours) |
|-------|-------------|-----------------------------|
| CNAME | `operators` | `cname.vercel-dns-0.com` **or** a project-specific host like `xxxx.vercel-dns-017.com` |

**Important:** Copy the **Value** from **your** Vercel domain card. Do not guess from another project or old docs. That value is what you paste into GoDaddy.

Keep this tab open while you do Part B.

### A4. Add the environment variable (same Vercel project)

1. Still in the project: **Settings** → left sidebar **Environment Variables**.
2. Click **Add New**.
3. Key:

   ```text
   NEXT_PUBLIC_OPERATOR_HOST
   ```

4. Value:

   ```text
   operators.travelscout.co.nz
   ```

5. Environments: enable at least **Production** (and **Preview** only if you also have a real preview subdomain).
6. Save, then **redeploy** Production so the new env var is live:
   - **Deployments** → open the latest Production deployment → **⋯** → **Redeploy**.

Until this env var is set and redeployed, `/operator` on the main site will not redirect to the subdomain.

---

## Part B — GoDaddy (create the DNS CNAME)

Registrar: **GoDaddy** (DNS for `travelscout.co.nz`).

### B1. Open DNS management

1. Go to [https://www.godaddy.com](https://www.godaddy.com) and sign in.
2. Open your account menu → **My Products** (or go to [https://account.godaddy.com/products](https://account.godaddy.com/products)).
3. Find domain **travelscout.co.nz**.
4. Click **DNS** (sometimes labeled **Manage DNS** next to the domain).

You should now see the DNS records list for `travelscout.co.nz`.

### B2. Add the CNAME for operators

1. Click **Add** (or **Add New Record**).
2. Fill in:

| Field in GoDaddy | What to enter |
|------------------|---------------|
| **Type** | `CNAME` |
| **Name** / **Host** | `operators` |
| **Value** / **Points to** / **Data** | Paste the **exact** CNAME target from Vercel (Part A3) |
| **TTL** | `1 Hour` (or default / 600 seconds) |

3. Click **Save**.

Notes for GoDaddy UI quirks:

- Enter **only** `operators` in Name/Host — **not** `operators.travelscout.co.nz`. GoDaddy appends the domain for you.
- If GoDaddy asks for a trailing dot on the Value, use whatever Vercel displayed (including a trailing `.` if shown).
- Do **not** create an A record for `operators` — use CNAME only.
- Do **not** change nameservers or touch your existing apex (`@`) / `www` records unless you intend to move the whole site.

### B3. Wait for DNS + SSL

1. Go back to Vercel → project → **Settings** → **Domains**.
2. Wait until `operators.travelscout.co.nz` shows **Valid Configuration** (often minutes; sometimes up to a few hours).
3. Vercel will issue HTTPS automatically once DNS is correct.

Quick check in a terminal (optional):

```bash
dig CNAME operators.travelscout.co.nz +short
```

You should see the same Vercel CNAME target you added.

---

## Part C — Supabase Auth (allow login on the subdomain)

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Select the **Production** project used by TravelScout.
3. Left sidebar: **Authentication**.
4. Under Configuration (or URL settings): open **URL Configuration**.
5. Keep **Site URL** as your main site, e.g. `https://travelscout.co.nz`.
6. Under **Redirect URLs**, add (one per line / entry):

   ```text
   https://travelscout.co.nz/**
   https://operators.travelscout.co.nz/**
   http://localhost:3000/**
   http://operators.localhost:3000/**
   ```

7. Save.

Without these, password reset / magic links can fail on the operator host even if the site loads.

---

## Verify it works

1. Open `https://operators.travelscout.co.nz` → operator portal (slim header, not full marketing nav).
2. Open `https://travelscout.co.nz/operator` → should **308 redirect** to the operators subdomain (after env redeploy).
3. On the main site footer, **For operators** should open the subdomain.
4. Sign in on the operator host; you should land on the operator dashboard.

---

## Local development (optional)

In `.env.local`:

```bash
NEXT_PUBLIC_OPERATOR_HOST=operators.localhost
```

Then:

- Traveler: `http://localhost:3000`
- Operators: `http://operators.localhost:3000`

---

## Preview / Dev environments

- For **Production only**, use `operators.travelscout.co.nz` as above.
- For a separate Dev Vercel env, either:
  - leave `NEXT_PUBLIC_OPERATOR_HOST` unset (operators use `/operator` on the Dev hostname), or
  - create a second subdomain (e.g. `operators-dev.travelscout.co.nz`) with the same Vercel + GoDaddy steps pointed at the Dev project/env.
