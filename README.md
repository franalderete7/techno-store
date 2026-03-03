# Techno Store – Products Admin

A Next.js admin app for managing products in Supabase. Built with shadcn/ui and dark theme.

## Features

- **View** all products in a table
- **Edit** every column (except image – managed separately)
- **Delete** products with confirmation
- **Add** new products with all fields

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

3. **Apply database schema**

   Ensure your Supabase project has the `products` table. See `DATABASE_SCHEMA.md` for the full schema. The SQL you provided should be run in the Supabase SQL editor if the table does not exist yet.

4. **RLS**

   If Row Level Security is enabled on `products`, grant read/write access for your use case (e.g. for admin dashboard, you may use a service role key or specific RLS policies for authenticated users).

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
4. Deploy
