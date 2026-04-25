# Menu Garden Web

Next.js App Router web/PWA for the Menu Garden MVP.

## MVP behavior

- Anonymous visitors can upload one menu as either PDFs or images/photos.
- PDF and image files cannot be mixed in the same upload.
- Phone camera uploads support multiple photos for multi-page menus.
- Converted menus are unlisted by default and accessible by direct link.
- Anonymous chat is ephemeral, one answer at a time, and capped at 2,000 characters per question.

## Development

Use Node `24.14.1` from the repo root.

```bash
npm run convex:dev
npm run dev --workspace @menu-garden/web
```

Before calling web launch work done, run:

```bash
npm run typecheck
npm run build --workspace @menu-garden/web
```

## Deployment

Deploy from the monorepo root so Vercel can run `scripts/build.sh` and build
against the shared Convex package.
