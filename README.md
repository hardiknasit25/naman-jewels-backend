# Naman Jewels Admin — Backend

Standalone Node.js + TypeScript + Express + Sequelize (MySQL) API server for the
Naman Jewels admin panel. The frontend is a separate project
([naman-jewels-admin-frontend](../naman-jewels-admin-frontend)) that talks to
this API over HTTP.

The backend follows an MVC structure (`models/`, `controllers/`, `routes/`,
plus `middleware/`, `services/`, `validators/`). It provides JWT auth (per-user
session-duration expiry), full CRUD for every entity with Zod validation,
disk-backed media storage, and session + audit logging. All tables use a `tbl_`
prefix and numeric auto-increment primary keys.

## Images

Uploads are posted as raw bytes to `POST /api/uploads`, written under
`UPLOAD_DIR` with a content-hash filename, and served from `/uploads` with a
permanent cache header. The database stores only the API-relative URL.

Images used to be kept as Base64 data URLs in the rows themselves, which made
list responses enormous and left the pictures uncacheable. To convert existing
rows:

```bash
npm run migrate:images -- --dry   # report what would change
npm run migrate:images            # convert
```

It only touches values starting with `data:`, so it is safe to re-run. Note the
uploads folder now needs backing up alongside the database.

## Prerequisites

- Node.js 18+
- A MySQL server. Configure connection details in `.env` (copy from
  `.env.example`). On first run the backend creates the database, tables, and
  seed data automatically.

Default admin login: **admin@namanjewels.com** / **admin123**

## Setup

```bash
npm install
cp .env.example .env   # then edit .env
```

## Development

```bash
npm run dev
```

The API listens on `http://localhost:3000` (configurable via `PORT`).

## Production

```bash
npm run build
npm start
```

## Configuration

| Variable                 | Default       | Description                                             |
| ------------------------ | ------------- | ------------------------------------------------------- |
| `PORT`                   | `3000`        | Port the API listens on                                 |
| `NODE_ENV`               | `development` | Runtime mode                                            |
| `CORS_ORIGIN`            | `*`           | Allowed frontend origin(s); `*` or comma-separated list |
| `JWT_SECRET`             | —             | Secret used to sign JWTs (required)                     |
| `ADMIN_SESSION_DURATION` | `1d`          | Seeded admin session length / JWT expiry                |
| `UPLOAD_DIR`             | `uploads`     | Folder for uploaded images (absolute path in production) |
| `DB_HOST`                | `127.0.0.1`   | MySQL host                                              |
| `DB_PORT`                | `3306`        | MySQL port                                              |
| `DB_NAME`                | —             | Database name (required)                                |
| `DB_USER`                | —             | Database user (required)                                |
| `DB_PASSWORD`            | `` (empty)    | Database password                                       |
| `DB_LOGGING`             | `false`       | Log SQL queries                                         |

## API

All endpoints are served under `/api`, e.g.:

- `POST /api/auth/login` — JWT login
- `POST /api/auth/logout` — close the session
- `GET|POST|PATCH|DELETE /api/customers` (and every other entity)

Because the frontend is deployed on a separate origin, set `CORS_ORIGIN` to that
origin (or `*`) so the browser allows the cross-origin requests.
