# Techno Store – Products Admin

A Next.js app with a public storefront plus a protected admin panel for managing products in Supabase. Built with shadcn/ui and dark theme.

## Routes

- Public storefront: `/`
- Public product detail: `/productos/[handle]`
- Admin login: `/admin/login`
- Admin dashboard: `/admin`
- Admin stock: `/admin/stock`
- Admin purchases: `/admin/purchases`
- Admin CRM: `/admin/crm`

## Setup

1. **Clone and install**

   ```bash
   npm install
   ```

2. **Configure Supabase**

   Create `.env.local` in the project root:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your Supabase credentials:

   - Get **URL** and **anon key** from [Supabase](https://supabase.com) → your project → Settings → API
   - Set:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   For the protected admin area, also configure Supabase Auth:

   - Go to **Authentication** → **Providers** → **Email**
   - Enable email/password login
   - Optionally enable email confirmation if you want new admin accounts to confirm their email first

3. **Apply database schema**

   Ensure your Supabase project has the `products` table. See `DATABASE_SCHEMA.md` for the full schema. The SQL you provided should be run in the Supabase SQL editor if the table does not exist yet.

4. **RLS**

   If Row Level Security is enabled on `products`, grant read/write access for your use case (e.g. for admin dashboard, you may use a service role key or specific RLS policies for authenticated users).

5. **Optional but recommended: admin allowlist**

   Add this server-side env if you want only specific emails to access `/admin/*`:

   - `ADMIN_EMAIL_ALLOWLIST=you@example.com,partner@example.com`

   If this variable is omitted, any authenticated Supabase user can enter the admin panel.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add environment variables in project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ADMIN_EMAIL_ALLOWLIST` (recommended)
4. Deploy
