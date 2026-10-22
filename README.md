# Penta Prizm · Wedding AI Photo Finder

Wedding AI Photo Finder is a multi-tenant SaaS platform owned and operated by **Penta Prizm**. It enables wedding photographers to organize ceremonies, manage client events, generate custom printable guest QR codes, and prepare Google Drive photo galleries.

---

## 1. Multi-Tenant Architecture & Penta Prizm Superadmin

### Super Admin Portal (`/superadmin`)
- **Role Isolation**: Strict server-side `SUPERADMIN` role authorization (`requireSuperAdmin` middleware). Photographers cannot access admin APIs or data by changing URLs or headers.
- **Dedicated Sessions**: Superadmin authentication uses a dedicated HTTP-only cookie (`penta_superadmin_token`), maintaining complete separation from photographer cookies.
- **Automated Bootstrapping**: Automatically initializes the default platform superadmin on server startup if no superadmin exists in MongoDB.
  - Default Admin Email: `admin@pentaprizm.com`
  - Default Admin Password: `PentaPrizm2026!` (Configurable via `SUPERADMIN_DEFAULT_PASSWORD` in `.env`)
- **No Public Superadmin Registration**: Superadmin accounts can only be provisioned server-side.
- **Audit Logging**: All administrative operations (logins, logouts, invitation generations, studio suspensions, trial extensions) are recorded in an immutable MongoDB audit ledger (`AdminAuditLog`).

### Photographer Authentication — Firebase Google Sign-In

Photographers no longer have a password. The studio portal is protected by **Firebase Authentication with the Google provider**:

- **One-button sign-in**: the login page offers a single *Continue with Google* button. There is no password form, no registration form, and no login OTP.
- **Server-side token verification**: the browser obtains a Firebase ID token and sends it to `POST /api/auth/google`. The backend verifies it with the **Firebase Admin SDK** (`auth.verifyIdToken(idToken, true)`) and only then issues the application session cookie.
- **Never trust the client**: the email, UID and role are read *only* from the verified token or the stored MongoDB record — never from the request body. A client that posts its own `email`/`uid`/`role` is ignored.
- **Provider and email verification enforced**: only `google.com` sign-ins are accepted, and the Google account's email must be `email_verified`.
- **Stable identity**: the Firebase UID is the stable identity (`photographer.firebaseUid`, unique + sparse index). The UID is never exposed through the API.

### Account Linking & Migration

Existing photographer records are preserved. On the first Google sign-in the backend resolves the account in this order:

1. A record already bound to that Firebase UID → reused.
2. A record with the same email that has **no** Firebase UID yet (a legacy account) → **linked** to that UID. This is safe because the email comes from a Google-verified Firebase token, so the person signing in demonstrably controls that mailbox. The same record is reused — no duplicate is created and no events, Drive metadata or trial are lost.
3. Otherwise a **new** record is created (default 30-day trial, or the pending invitation's trial length).

A record already bound to a *different* Firebase UID is **never merged** — the sign-in is refused with `ACCOUNT_LINK_CONFLICT`, so two Google accounts cannot collide on one mailbox.

The retired `loginOtp` sub-document and photographer password hashes can be cleaned up with:

```bash
npm run migrate:firebase            # dry run — reports what would change
npm run migrate:firebase -- --apply # writes the changes
```

The migration never sets a `firebaseUid` from an email address, never touches events, Drive metadata, audit logs or invitations, and never touches the Super Admin account.

### Super Admin Authentication (unchanged, and still separate)

The Penta Prizm Super Admin console keeps its **own** password authentication, its own cookie (`penta_superadmin_token`) and its own session token type (`SUPERADMIN_SESSION`). Photographer sessions use a different token type (`PHOTOGRAPHER_SESSION`), so a session from one surface can never be replayed against the other. Super Admin audit logging is untouched. A Google sign-in can never grant `SUPERADMIN`.

### Account Lifecycle & Trial Management
- **Account Status**: Studios can be `ACTIVE` or `SUSPENDED`.
  - Suspended accounts are immediately blocked from all photographer APIs and cannot sign in.
- **Trial & License Enforcement**:
  - Trials have configurable duration (e.g. 14, 30, 60 days).
  - Expired trial accounts retain read-only access to view their existing wedding events and download QR codes, but cannot create or edit events until extended or renewed.
  - Admins can extend trials directly from the Superadmin console (+14, +30, +60 days, or custom dates).

### Google Drive Onboarding

After a successful Google sign-in the photographer is taken straight to the Google Drive consent screen:

1. The backend starts the OAuth 2.0 authorization-code flow with **PKCE** (`S256`), a **HMAC-signed `state`** bound to the photographer, and a **server-side `code_verifier`** kept in an `httpOnly` cookie.
2. The refresh token is encrypted with AES-256-GCM and stored on the photographer record. It is never sent to the browser.
3. If the photographer **declines** Drive access they can still use the studio portal — Drive is simply marked *Not Connected* and a **Connect Google Drive** action is offered from the dashboard and from every event.
4. Once authorised, every new wedding automatically gets a folder inside the dedicated `Wedding AI Photo Finder` parent folder.

---

## 2. Technology Stack

### Frontend
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 (Penta Prizm luxury palette: ivory `#FAF8F5`, charcoal `#1C1917`, champagne `#C5A880`)
- **Typography**: Playfair Display (Serif) & Plus Jakarta Sans
- **Routing**: React Router 7
- **Forms & Validation**: React Hook Form + Zod
- **Icons**: Lucide React
- **Network**: Axios with credentials & error interception

### Backend
- **Runtime**: Node.js (v22+) & TypeScript with `tsx`
- **Framework**: Express 4 (with `trust proxy: 1`)
- **Database**: MongoDB Atlas with Mongoose 8 (with fallback to embedded Mongo engine for dev)
- **Authentication**: Photographers use **Firebase Authentication (Google provider)**; the backend verifies ID tokens with the **Firebase Admin SDK** and issues its own session cookie. Super Admin uses a separate password + `SUPERADMIN_SESSION` token + dedicated cookie.
- **Security**: `helmet`, `cors`, and `express-rate-limit`
- **Integrations**: `googleapis` (Google Drive OAuth 2.0 with PKCE + AES-256-GCM encrypted refresh tokens)
- **QR Engine**: `qrcode`

---

## 3. Environment Configuration

Copy `.env.example` to `.env`:

```bash
# Server Port & Mode
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# MongoDB Connection
# Set your MongoDB Atlas URI. If omitted, an embedded local MongoDB instance runs automatically.
MONGODB_URI=

# Authentication Secrets
JWT_SECRET=super-secret-wedding-ai-jwt-token-key-2026-production
COOKIE_NAME=wedding_auth_token

# Penta Prizm Superadmin
SUPERADMIN_COOKIE_NAME=penta_superadmin_token
SUPERADMIN_EMAIL=admin@pentaprizm.com
SUPERADMIN_DEFAULT_PASSWORD=PentaPrizm2026!

# Firebase Web App configuration — FRONTEND (public identifiers, VITE_ prefix)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=wedding-ai-image-finder.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=wedding-ai-image-finder
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Firebase Admin SDK — SERVER-SIDE SECRETS (never a VITE_ variable)
# Option A (recommended on Vercel): the whole service-account JSON blob
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
# Option B (local development): the individual fields
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google Drive OAuth 2.0 (SERVER-SIDE ONLY — never use a VITE_ prefix)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Local development callback (register verbatim in Google Cloud Console)
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google-drive/callback
# Production callback (Vercel) — used automatically when NODE_ENV=production or VERCEL=1
GOOGLE_REDIRECT_URI_PRODUCTION=https://your-project.vercel.app/api/integrations/google-drive/callback

# Token Encryption (AES-256-GCM) — changing this invalidates stored refresh tokens
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
# HMAC key for the OAuth state parameter (CSRF protection)
OAUTH_STATE_SECRET=wedding-oauth-state-secret-2026-secure
```

> **Security**
> - `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET` and the whole `FIREBASE_SERVICE_ACCOUNT` are read by the Express backend only. Never put them in a `VITE_`-prefixed variable — Vite inlines those into the public frontend bundle.
> - The `VITE_FIREBASE_*` values are **public identifiers**. Firebase explicitly documents the Web API key as safe to ship in client-side code; access is controlled by Firebase Security Rules and the OAuth consent screen, not by hiding the key.
> - `.env` is git-ignored (`.env.example` is committed).

---

## 3.1 Firebase Authentication Setup (one-time)

### Step 1 — Firebase project

Your project: **`wedding-ai-image-finder`** (auth domain `wedding-ai-image-finder.firebaseapp.com`).

Open [console.firebase.google.com](https://console.firebase.google.com) → project `wedding-ai-image-finder` → **Project settings (gear) → General → Your apps → Web (`</>`)**. If no Web app exists, add one. Copy the `firebaseConfig` block — you need all six values:

```js
const firebaseConfig = {
  apiKey: "…",                    // → VITE_FIREBASE_API_KEY
  authDomain: "wedding-ai-image-finder.firebaseapp.com",
  projectId: "wedding-ai-image-finder",
  storageBucket: "…",             // → VITE_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "…",         // → VITE_FIREBASE_MESSAGING_SENDER_ID
  appId: "…"                      // → VITE_FIREBASE_APP_ID
};
```

> Only `apiKey`, `authDomain`, `projectId` and `appId` are **required for sign-in**. `storageBucket` and `messagingSenderId` are part of the standard Web App config but are only used by Cloud Storage and Cloud Messaging, so they are optional here.

### Step 2 — Enable the Google sign-in provider

1. **Build → Authentication → Sign-in method**.
2. Click **Google**, enable it, and enter a support email + display name.
3. Optionally set a **custom OAuth client** for the Google provider to control which OAuth client performs sign-in. The default Firebase-provided client works out of the box.

> **Important**: Firebase's Google provider and the **Google Drive OAuth client are separate**. Signing in with Google via Firebase does **not** grant Drive access. The Drive authorisation is a distinct OAuth flow the backend runs (see 3.2).

### Step 3 — Authorised domains

*Authentication → Settings → Authorised domains* — add:

- `localhost` (local development)
- `your-project.vercel.app` (production)

### Step 4 — Service account for the backend

1. *Project settings → Service accounts → Generate new private key* (downloads a JSON file).
2. Use **Option A** (paste the whole JSON into `FIREBASE_SERVICE_ACCOUNT`) or **Option B** (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
3. On Vercel, paste the JSON into the `FIREBASE_SERVICE_ACCOUNT` environment variable. Keep the `\n` escapes inside `private_key` intact.

> The service account is a **private credential**. It is only ever read by the backend (`server/config/firebase.ts`) and is never imported into frontend code. The frontend has no way to read it — Vite only exposes `VITE_`-prefixed variables to the browser bundle.

### Step 5 — Frontend configuration

Set the six `VITE_FIREBASE_*` variables in `.env` (and in Vercel's environment variables). The reusable client module `src/config/firebase.ts` reads them, validates them and initialises the Firebase app lazily. When a required value is missing the login page renders a clear "Firebase setup required" message listing the missing keys instead of failing silently.

**Firebase Analytics is not enabled** — it is not required for authentication and would add an unnecessary third-party script.

### Step 6 — Migrate existing photographer accounts

```bash
npm run migrate:firebase            # dry run — reports what would change
npm run migrate:firebase -- --apply # writes the changes
```

This removes the retired login-OTP data and photographer password hashes. Existing accounts are linked to their Google identity automatically on their next sign-in.

---

## 3.2 Google Drive OAuth Setup (Google Cloud Console)

The integration uses the **Google Drive API** (not Firebase). Minimum permission set:

| Scope | Why it is needed |
|---|---|
| `https://www.googleapis.com/auth/drive.file` | Per-file access to the folders this app creates. The photographer keeps full control of the rest of their Drive. |
| `https://www.googleapis.com/auth/userinfo.email` | Display which Google account is linked in the studio dashboard. No profile data is stored. |

### Step-by-step

1. **Create/select a project** — [console.cloud.google.com](https://console.cloud.google.com).
2. **Enable the API** — *APIs & Services → Library → Google Drive API → Enable*.
3. **Configure the OAuth consent screen** — *APIs & Services → OAuth consent screen*.
   - Choose **External**.
   - Add the two scopes listed above under **Data Access**.
   - While the publishing status is **Testing**, add every photographer Gmail address under **Test users** — only listed accounts can authorize. Testing-mode refresh tokens expire after **7 days**, so those accounts must reconnect weekly.
   - Before public launch, switch to **In production**. Because `drive.file` is a sensitive scope, Google requires a verified brand/domain or a completed **OAuth verification review**. Until verification completes, users see an *"Google hasn't verified this app"* warning and only test users can authorize.
4. **Create the credentials** — *APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application*.
5. **Add the authorized redirect URIs** — these must match the server configuration **byte-for-byte** (scheme, host, port, path). Add **both**:
   - `http://localhost:3000/api/integrations/google-drive/callback` (local)
   - `https://<your-project>.vercel.app/api/integrations/google-drive/callback` (production)
6. **Set the environment variables** shown in section 3, then restart the server.

### How the flow works

1. The photographer clicks **Connect Google Drive** in the studio dashboard.
2. The backend issues a **HMAC-SHA256 signed** `state` token bound to the photographer's account, stored in an `httpOnly` cookie (`wedding_oauth_state`, 10-minute TTL).
3. The browser is redirected to Google with `access_type=offline` so a refresh token is always issued.
4. Google calls back to `/api/integrations/google-drive/callback`. The backend verifies the state signature, the cookie match, the 10-minute expiry and the photographer's account status **before** exchanging the code.
5. The refresh token is encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) and stored on the photographer document. It is never returned by any API endpoint.
6. Access tokens are short-lived and refreshed automatically from the stored refresh token. If Google rotates the refresh token, the new value is persisted atomically.

### Automatic folder creation

When a photographer with a connected Drive creates an event:

1. The parent folder **`Wedding AI Photo Finder`** is resolved or created in their Drive.
2. A folder named after the event is created inside it and tagged with the event id (`appProperties`), which makes creation **idempotent** — retries never create duplicates.
3. The folder id and `webViewLink` are stored on the event document (`driveFolderId`, `driveFolderWebViewLink`).

If Drive is not connected, the event is still created and the UI shows *"Connect Google Drive to create the folder automatically"*. If folder creation fails, the event records a `FAILED` status with the error and the dashboard exposes a **Retry Folder Creation** action — retrying never creates a duplicate event.

---

## 3.3 Backend Configuration Reference

Everything the **server** needs, and where each value comes from. None of these are read by the browser.

### Firebase Admin SDK (verifies the ID tokens the browser sends)

| Variable | Required | Where to get it |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | **Yes** (Option A) | Firebase Console → Project settings → Service accounts → Generate new private key → paste the whole JSON |
| `FIREBASE_PROJECT_ID` | **Yes** (Option B) | Same JSON file → `project_id` |
| `FIREBASE_CLIENT_EMAIL` | **Yes** (Option B) | Same JSON file → `client_email` |
| `FIREBASE_PRIVATE_KEY` | **Yes** (Option B) | Same JSON file → `private_key` (keep the `\n` escapes) |

Read by `server/config/firebase.ts`. The private key is loaded into the Firebase Admin SDK **server-side only** and is never sent to the browser.

The backend needs **no** Firebase web configuration — the browser gets its own from `VITE_FIREBASE_*`. The backend only needs to know the service account so it can verify tokens.

### Google Drive OAuth 2.0 (the separate Drive authorisation)

| Variable | Required | Where to get it |
|---|---|---|
| `GOOGLE_CLIENT_ID` | **Yes** | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application) → Client ID |
| `GOOGLE_CLIENT_SECRET` | **Yes** | Same screen → Client secret |
| `GOOGLE_REDIRECT_URI` | **Yes** (local) | `http://localhost:3000/api/integrations/google-drive/callback` — register verbatim |
| `GOOGLE_REDIRECT_URI_PRODUCTION` | **Yes** (Vercel) | `https://<project>.vercel.app/api/integrations/google-drive/callback` — register verbatim as a **second** URI |
| `TOKEN_ENCRYPTION_KEY` | **Yes** | `openssl rand -hex 32` — encrypts the Drive refresh token at rest |
| `OAUTH_STATE_SECRET` | **Yes** | `openssl rand -hex 32` — HMAC-signs the OAuth `state` parameter |

Also required once in the Google Cloud Console:

- **Google Drive API** enabled (*APIs & Services → Library*).
- OAuth consent screen → **External**, with the scopes `https://www.googleapis.com/auth/drive.file` and `https://www.googleapis.com/auth/userinfo.email`.
- Test users added while the consent screen is in **Testing** mode.

### Existing application secrets (unchanged)

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Signs the photographer (`PHOTOGRAPHER_SESSION`) and Super Admin (`SUPERADMIN_SESSION`) session tokens |
| `COOKIE_NAME` / `SUPERADMIN_COOKIE_NAME` | Session cookie names for the two separate surfaces |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_DEFAULT_PASSWORD` | Super Admin password login (**unchanged** — it is not Firebase) |
| `CLIENT_URL` | Base URL for post-OAuth redirects. If unset in production, redirects stay relative so they never point at `localhost` |

### Quick sanity check

```bash
# Is the backend able to verify Firebase tokens?
curl -s http://localhost:3000/api/auth/firebase-config
# → {"success":true,"data":{"configured":true,"projectId":"wedding-ai-image-finder"}}
```

If `configured` is `false`, the service account is missing or malformed. If `projectId` differs from `VITE_FIREBASE_PROJECT_ID`, the browser and the server are pointed at different Firebase projects and every sign-in will fail with `INVALID_ID_TOKEN`.

---

## 4. API Endpoints

### Superadmin Endpoints (`/api/superadmin/*`)
- `POST /api/superadmin/auth/login` — Authenticate superadmin credentials
- `POST /api/superadmin/auth/logout` — Terminate superadmin session
- `GET /api/superadmin/auth/me` — Superadmin profile
- `GET /api/superadmin/dashboard-stats` — Platform metrics (studios, trials, invitations, weddings)
- `POST /api/superadmin/invitations` — Generate photographer invitation & 6-digit code
- `GET /api/superadmin/invitations` — List all generated invitations
- `POST /api/superadmin/invitations/:id/revoke` — Invalidate an invitation
- `GET /api/superadmin/photographers` — List studios with search, status filters, and wedding counts
- `GET /api/superadmin/photographers/:id` — Individual studio details and recent weddings
- `PATCH /api/superadmin/photographers/:id/status` — Suspend or reactivate a photographer
- `PATCH /api/superadmin/photographers/:id/trial` — Extend trial expiry date
- `GET /api/superadmin/audit-logs` — Administrative audit ledger

### Photographer Authentication (`/api/auth/*`)
- `GET /api/auth/firebase-config` — Backend Firebase readiness (`configured`) and the project id it verifies tokens against. Used by the frontend to detect a frontend/backend project mismatch. **No web configuration and no secrets are served** — the browser reads its own configuration from `VITE_FIREBASE_*`
- `POST /api/auth/google` — Sign in with a Firebase ID token from Google Sign-In. The token is verified with the Firebase Admin SDK, the account is resolved/linked, and a photographer session cookie is issued
- `GET /api/auth/onboarding` — Whether the photographer still needs to authorise Google Drive
- `POST /api/auth/logout` — Clear session
- `GET /api/auth/me` — Photographer profile and trial access status

> The previous `POST /api/auth/register`, `POST /api/auth/login` and `POST /api/auth/verify-login-otp` routes have been **removed**, along with `POST /api/superadmin/photographers/:id/login-otp`. Photographers authenticate exclusively with Google.

### Wedding Events (`/api/events/*` - Protected)
- `GET /api/events` — List photographer's own events
- `GET /api/events/:id` — Event details and QR code data URL
- `POST /api/events` — Create wedding (blocked if trial expired or account suspended). Creates the Google Drive folder automatically when Drive is connected
- `PATCH /api/events/:id` — Update wedding (blocked if trial expired or account suspended). Drive fields are server-owned and cannot be written by the client
- `DELETE /api/events/:id` — Delete wedding (blocked if trial expired or account suspended)
- `GET /api/events/:id/drive-folder` — Drive folder metadata for the event (id, name, link, status)
- `POST /api/events/:id/drive-folder/retry` — Idempotently (re)create the Drive folder for the event (blocked if trial expired or account suspended)

### Google Drive Integration (`/api/integrations/google-drive/*`)
- `GET /status` — Connection state (`configured`, `connected`, `reconnectRequired`) and the exact registered callback URI
- `GET /connect` — Begin the OAuth flow (photographer session required). Returns the authorization URL when requested as JSON, otherwise redirects
- `GET /callback` — Google redirect target. Verifies the signed state + cookie, then stores the encrypted refresh token
- `POST /verify` — Verify the stored connection is still usable with a read-only Drive call
- `DELETE /disconnect` — Revoke the Google grant and clear the stored credentials (existing Drive folders are left untouched)

### Public Guest Endpoint (`/api/public/*`)
- `GET /api/public/events/:token` — Retrieve guest-safe wedding ceremony information

---

## 5. Development & Running

```bash
# Install dependencies
npm install

# Start full-stack development server (Express API + Vite frontend on one port)
npm run dev
```

- Photographer Portal: `http://localhost:3000/login`
- Penta Prizm Superadmin: `http://localhost:3000/superadmin`
  - Default Login: `admin@pentaprizm.com` / `PentaPrizm2026!`

> The whole application runs from the repository root as a **single process**. `server.ts` starts Express and mounts Vite in middleware mode, so `src/` (frontend) and `server/` (backend) are served together on port 3000. There is no separate frontend folder to start.

### Tests & Verification

```bash
# TypeScript type check
npm run lint

# Automated test suite (real MongoDB via embedded mongod)
npm test

# Production build
npm run build

# Migration dry run (then --apply to write)
npm run migrate:firebase
```

**Automated tests vs. real Firebase / Google verification — these are different things.**

`npm test` runs an automated suite against a **real MongoDB instance** with two in-process substitutes:

- a **fake Google Drive client**, and
- a **stub Firebase ID-token verifier** (`setIdTokenVerifier`).

It verifies *our* integration logic: OAuth state signing and CSRF binding, PKCE presence, callback validation, folder creation idempotency, duplicate prevention, retry after partial failure, refresh-token encryption and rotation, revoked-grant handling, cross-photographer access denial, MongoDB persistence, Firebase identity linking (first-time / returning / legacy-link / conflict), suspended-account blocking, session-token separation between the photographer and Super Admin surfaces, and that the removed password/OTP routes return 404.

It does **not** contact Firebase or Google.

To prove the integration works against the **real** services:

```bash
# Real Google OAuth + Drive API
npm run verify:drive:live
npm run verify:drive:live -- --code <AUTHORIZATION_CODE_FROM_BROWSER>
```

The Firebase path requires a human to complete the Google consent screen in a browser — sign in at `http://localhost:3000/login` and click *Continue with Google*. See the verification checklist below.

### Manual verification checklist (requires live credentials)

| Step | What it proves | Status |
|---|---|---|
| Configure the Firebase project + Google provider, then click *Continue with Google* | Firebase issues a real ID token; the Admin SDK verifies it; the session cookie is issued | ☐ requires credentials |
| Sign in with a Google account that has never used the app | A new photographer record is created with the correct email, name and a 30-day trial | ☐ requires credentials |
| Sign in again with the same Google account | The **same** record is reused — no duplicate is created | ☐ requires credentials |
| Sign in with a Google account matching an existing legacy record | The legacy record is linked (same `_id`), events and Drive metadata intact | ☐ requires credentials |
| Sign in with a Google account matching a record already bound to a different UID | Sign-in is refused with `ACCOUNT_LINK_CONFLICT` | ☐ requires credentials |
| Sign in as a suspended studio | Sign-in is refused with `ACCOUNT_SUSPENDED` and no cookie is issued | ☐ requires credentials |
| Complete the Drive consent screen | The refresh token is stored encrypted; the `Wedding AI Photo Finder` parent folder is created in the real Drive | ☐ requires credentials |
| Decline the Drive consent screen | The app still works; Drive shows *Not Connected* with a retry action | ☐ requires credentials |
| Create a wedding with Drive connected | A folder is created inside the parent folder and linked to the event | ☐ requires credentials |
| Trigger a folder-creation failure, then retry | The retry reuses the same folder — no duplicates | ☐ requires credentials |
| `npm run verify:drive:live -- --code <CODE>` | The **real** Google OAuth and Drive APIs work end to end | ☐ requires credentials |

### Deployment (Vercel)

The Vercel deployment uses a serverless function at `api/index.ts` which reuses the same `createApp()` Express application, so local and production behave identically. `vercel.json` routes `/api/*` to that function.

Set these as **Vercel environment variables** (never as `VITE_*` variables):

```
MONGODB_URI
JWT_SECRET
CLIENT_URL=https://<your-project>.vercel.app

# Firebase Authentication — frontend (public identifiers)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=wedding-ai-image-finder.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=wedding-ai-image-finder
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Firebase Authentication — backend (service account, secret)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}

# Google Drive OAuth
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI_PRODUCTION=https://<your-project>.vercel.app/api/integrations/google-drive/callback

# Secrets
TOKEN_ENCRYPTION_KEY
OAUTH_STATE_SECRET
```

The production callback URI must be registered in the Google Cloud Console exactly as shown above, and `your-project.vercel.app` must be added to the Firebase console's **Authentication → Settings → Authorised domains**.
