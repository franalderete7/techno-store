# Vercel Deployment – Manual Steps

## ⚠️ CRITICAL: Set Framework to Next.js

**This is the #1 cause of 404 errors.** Vercel Staff have confirmed that wrong framework detection causes 404 even when the build succeeds.

1. Go to **Project Settings** → **General**
2. Under **Build & Development Settings**, find **Framework Preset**
3. **Explicitly select "Next.js"** (do not leave on "Other" or auto)
4. Redeploy after changing

Direct link: `https://vercel.com/[your-team]/[project-name]/settings`

## 1. Connect the Project

- Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
- Import your GitHub/GitLab/Bitbucket repo
- Pick the `techno-store` repository

## 2. Configure Project (Before Deploy)

- **Framework Preset:** **Must be "Next.js"** – select it explicitly!
- **Root Directory:** leave empty (or `.` if needed)
- **Build Command:** `npm run build`
- **Install Command:** `npm install`
- **Node.js Version:** 18.x or 20.x (Project Settings → General)

## 3. Add Environment Variables

- **Project Settings** → **Environment Variables**
- Add:
  - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
  - `TIENDANUBE_STORE_ID` = your Tienda Nube store id
  - `TIENDANUBE_ACCESS_TOKEN` = your Tienda Nube app/access token
  - `TIENDANUBE_USER_AGENT` = e.g. `TechnoStore Admin (you@example.com)`
- Enable for **Production**, **Preview**, and **Development**
- Save

## 4. Deploy

- Click **Deploy**
- Wait for the build to finish
- Open the deployment URL (e.g. `https://techno-store-xxx.vercel.app`)

## 5. If You Still See 404

- **Deployments** → latest deployment → **View Function Logs** (Runtime Logs)
- **Deployments** → latest deployment → **Building** tab for build logs
- **Project Settings** → **General** → set **Node.js Version** to `20.x`
- Trigger a new deployment after changing settings

## 6. Check Deployment Protection

- **Project Settings** → **Deployment Protection**
- If **Vercel Authentication** or **Password Protection** is on, log in or enter the password to view the site
