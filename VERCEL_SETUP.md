# Vercel Deployment – Manual Steps

## 1. Connect the Project

- Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
- Import your GitHub/GitLab/Bitbucket repo
- Pick the `techno-store` repository

## 2. Configure Project (Before Deploy)

- **Framework Preset:** `Next.js` (auto-detected)
- **Root Directory:** leave as `.` (unless the app is in a subfolder)
- **Build Command:** `npm run build`
- **Output Directory:** leave default (`.next`)
- **Install Command:** `npm install`

## 3. Add Environment Variables

- **Project Settings** → **Environment Variables**
- Add:
  - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
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
