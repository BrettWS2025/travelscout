# TravelScout (Starter)

A modern, visually striking comparison site starter inspired by the information architecture of MoneyHub—adapted for travel.

## Features
- Next.js App Router + TypeScript
- TailwindCSS with a dark, neon‑accented theme
- Accessible, mobile‑first components
- Sample comparison table + filters
- Marketing pages for Guides and Deals
- API route example

## Getting Started
```bash
npm install
npm run dev
```

## Recommended: Repo + CI
1. Initialize git and push to GitHub:
```bash
git init
git add .
git commit -m "chore: bootstrap TravelScout"
gh repo create travelscout --public --source=. --remote=origin --push
```
2. Add GitHub Actions (Next.js) later for CI/CD, or deploy to Vercel/Netlify.

## Customise
- Update `lib/products.ts` with real data or fetch from an API.
- Add "How this site works", "Advertising policy", and "Privacy" pages for transparency.
- Build comparison data models and a CMS (e.g., Sanity) if desired.
