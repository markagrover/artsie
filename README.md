# Artsie

Marketplace for **physical original artwork**. Artists list; sellers ship. Phase 1 is foundation only (auth, uploads, listings, public browse). Checkout / Stripe Connect / returns arrive in later phases.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React + TypeScript (Vite) — `apps/web` |
| API | Node + Express + Prisma — `apps/api` |
| Database | PostgreSQL |
| Auth | Email/password JWT (single account type; dual buyer/artist capability) |
| Images | Local disk by default; S3-compatible config documented below |

## Quick start

### 1. Postgres

```bash
# Docker (recommended)
docker compose up -d db

# Or any Postgres 16+ with:
# DATABASE_URL=postgresql://artsie:artsie@localhost:5432/artsie
```

### 2. Install & migrate

```bash
cp .env.example apps/api/.env   # adjust if needed
npm install
npm run db:migrate              # prisma migrate deploy
# empty DBs auto-seed on API start; or: npm run db:seed
```

### 3. Run (split local)

```bash
# terminal 1
npm run dev:api

# terminal 2
npm run dev:web
```

- Web: http://localhost:5173  
- API: http://localhost:4000  
- Seed login: `mira@artsie.studio` / `password123` (artist)  
  Buyer: `buyer@artsie.studio` / `password123`

The Vite dev server proxies `/api` and `/uploads` to the API.

### Unified host (Cursor Publish / production)

```bash
export DATABASE_URL=postgresql://artsie:artsie@localhost:5432/artsie
export JWT_SECRET=change-me-in-production
npm run build   # builds SPA + API, runs prisma migrate when DATABASE_URL is set
npm start       # Express serves /api, /uploads, and the Vite SPA on one port
```

`cursor-app.json` declares Postgres so Cursor Publish sets `DATABASE_URL` for build and runtime. Empty databases are seeded on boot with demo users and a sample listing.

## Image storage

Controlled by `STORAGE_DRIVER` in `apps/api/.env`:

| Driver | Behavior |
| --- | --- |
| `local` (default) | Files saved under `UPLOAD_DIR` (default `apps/api/uploads`) and served at `/uploads/*` |
| `s3` | **MVP stub** — still writes locally today. Set the env vars below and wire an S3 `PutObject` in `apps/api/src/lib/storage.ts` when you are ready for production object storage. |

S3-compatible env vars (MinIO, R2, AWS S3, etc.):

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=artsie-artwork
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BASE_URL=https://artsie-artwork.s3.amazonaws.com
```

## Schema notes (forward-compatible)

- `ArtworkKind`: `ORIGINAL` | `PRINT` | `DOWNLOAD` — Phase 1 API only creates `ORIGINAL`.
- `ListingStatus`: `DRAFT` | `PUBLISHED`.
- Per-listing flat shipping: `shippingPriceCents`, `shippingNotes`, `estimatedShipDays` (seller ships; checkout in Phase 2).
- Users: `isArtist` flag — same account can buy and sell.

## Phase 1 scope

- [x] Auth (register / login / profile; dual capability)
- [x] Artwork image upload
- [x] Listing CRUD (draft / published)
- [x] Public browse + listing detail
- [x] Shipping fields on the listing model

**Not in Phase 1:** Stripe checkout/Connect, orders, returns, listing fees.

## Monorepo layout

```
apps/web           React SPA (Vite)
apps/api           Express API + Prisma (also serves SPA after build)
scripts/migrate.mjs  Prisma migrate for publish builds
cursor-app.json    Declares Postgres for Cursor Publish
docker-compose.yml Postgres for local/dev
```
