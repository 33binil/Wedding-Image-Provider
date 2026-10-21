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

### Invitation-Gated Photographer Registration
- **No Unsolicited Signups**: Photographers cannot register without a valid, unexpired invitation code issued by Penta Prizm.
- **Single-Use 6-Digit Codes**: When an admin invites a studio, a cryptographically secure 6-digit random code is generated (`crypto.randomInt(100000, 1000000)`).
- **Hashed at Rest**: Stored exclusively as a one-way `bcryptjs` hash (`codeHash`). Plaintext codes are never stored or logged, and only shown once to the creating administrator.
- **Brute-Force Protection**: Invitations track failed activation attempts. After 5 incorrect attempts, the invitation is automatically revoked and locked.
- **Atomic Activation**: Account creation and invitation consumption occur atomically.

### Account Lifecycle & Trial Management
- **Account Status**: Studios can be `ACTIVE` or `SUSPENDED`.
  - Suspended accounts are immediately blocked from all photographer APIs and cannot log in.
- **Trial & License Enforcement**:
  - Trials have configurable duration (e.g. 14, 30, 60 days).
  - Expired trial accounts retain read-only access to view their existing wedding events and download QR codes, but cannot create or edit events until extended or renewed.
  - Admins can extend trials directly from the Superadmin console (+14, +30, +60 days, or custom dates).

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
- **Authentication**: JWT (`jsonwebtoken`) in secure HTTP-only cookies (`cookie-parser`) + `bcryptjs`
- **Security**: `helmet`, `cors`, and `express-rate-limit`
- **Integrations**: `googleapis` (Google Drive OAuth 2.0 with AES-256-GCM encrypted refresh tokens)
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

# Google Drive OAuth 2.0
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google-drive/callback

# Token Encryption (AES-256-GCM)
OAUTH_STATE_SECRET=wedding-oauth-state-secret-2026-secure
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

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
- `POST /api/auth/register` — Requires valid 6-digit activation code and matching invited email
- `POST /api/auth/login` — Photographer studio sign-in (enforces active account status)
- `POST /api/auth/logout` — Clear session
- `GET /api/auth/me` — Photographer profile and trial access status

### Wedding Events (`/api/events/*` - Protected)
- `GET /api/events` — List photographer's own events
- `GET /api/events/:id` — Event details and QR code data URL
- `POST /api/events` — Create wedding (blocked if trial expired or account suspended)
- `PATCH /api/events/:id` — Update wedding (blocked if trial expired or account suspended)
- `DELETE /api/events/:id` — Delete wedding (blocked if trial expired or account suspended)

### Public Guest Endpoint (`/api/public/*`)
- `GET /api/public/events/:token` — Retrieve guest-safe wedding ceremony information

---

## 5. Development & Running

```bash
# Start full-stack development server
npm run dev
```

- Photographer Portal: `http://localhost:3000/login`
- Penta Prizm Superadmin: `http://localhost:3000/superadmin`
  - Default Login: `admin@pentaprizm.com` / `PentaPrizm2026!`
