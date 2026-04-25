# Menu Garden

Accessibility-first web and mobile apps for turning restaurant menus into
structured, screen-reader-friendly experiences.

## Workspace

- `apps/web`: Next.js App Router consumer and restaurant portal scaffold
- `apps/mobile`: Expo Router consumer mobile scaffold
- `packages/shared`: Convex schema, actions, shared types, and reusable hooks

## MVP launch status

- Web/PWA MVP focuses on anonymous consumer workflows.
- Visitors can upload one menu as either PDF files or image/photo files.
- Multi-page phone camera uploads are supported through the web app's file input.
- Anonymous menu chat is ephemeral and limited to one answer at a time.
- Restaurant-owner tools exist in the codebase but are not surfaced in public navigation for MVP.

## Before running locally

Use Node `24.14.1` for this repo. If you use `nvm`, run `nvm use` at the repo root.

1. Install dependencies at the repo root.
2. Copy `.env.example` to `.env.local` for root-level local tooling if needed.
3. Copy `apps/web/.example.env` to `apps/web/.env.local`.
4. Copy `packages/shared/.env.example` to `packages/shared/.env.local` for Convex-side secrets during local development.
5. Fill in Convex and Clerk environment variables.
6. Run `npm run convex:dev` in one terminal.
7. Run `npm run dev --workspace @menu-garden/web` in another terminal.

The Expo app is intentionally out of scope for the first public MVP.

## Convex auth env

For Clerk + Convex auth, set `CLERK_JWT_ISSUER_DOMAIN` in Convex hosted
environment variables. This should be the Clerk JWT issuer domain for the same
Clerk instance used by `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and Convex expects
`applicationID: "convex"` in `auth.config.js`. The older
`CLERK_FRONTEND_API_URL` env var is still supported as a fallback, but new setup
should use `CLERK_JWT_ISSUER_DOMAIN`.

## Vercel deployment notes

Deploy the web MVP as a single Vercel project from the monorepo root. The root
`vercel.json` runs `scripts/build.sh`, which deploys Convex functions and builds
the Next.js app in `apps/web`.

Required Vercel environment variables:

- `CONVEX_DEPLOY_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL` once a stable preview or custom domain is chosen

Required Convex hosted environment variables:

- `OPENAI_API_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`

Optional Convex hosted environment variables:

- `GOOGLE_GEOCODING_API_KEY`
- `GOOGLE_PLACES_API_KEY`

## Validation

Per repo instructions, run `turbo typecheck` before calling a task done.
