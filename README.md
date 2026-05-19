# Pizza 42 — Auth0 Identity Platform POC

> A full-stack proof-of-concept built for the Okta / Auth0 Solution Engineering take-home challenge.  
> Demonstrates Auth0 as the complete identity backbone for a fictional pizza ordering company — from first login to admin analytics.

**🍕 Live App** → [pizza42-poc.vercel.app](https://pizza42-poc.vercel.app)  
**⚙️ Backend API** → [pizza42-api-r771.onrender.com](https://pizza42-api-r771.onrender.com)  
**📦 Repository** → [github.com/yarin-ist/Pizza42-POC](https://github.com/yarin-ist/Pizza42-POC)

---

## What This Project Demonstrates

This POC satisfies a real business brief from a fictitious company called Pizza 42: 600 locations, 2 million users, a legacy MySQL credential database, and three internal stakeholders with very different priorities.

| Stakeholder | Their Concern | What Auth0 Delivers Here |
|---|---|---|
| **Security Director** | Stored passwords are a liability. No OIDC compliance. No audit trail. | Zero credentials stored in the app. RS256 JWT validation. Breached password protection. Full log stream. |
| **Product Director** | Login friction kills conversions. Password resets overwhelm support. | One-tap Google SSO. Branded Universal Login. Self-service reset. Frictionless token refresh. |
| **Marketing Team** | Need enriched user profiles for campaigns. Can't ask everything at signup. | 4 progressive forms collect data across sessions. Every login pushes to Segment → Braze automatically. |

The entire solution runs in **production** on Vercel and Render. Everything below is live and testable right now.

---

## Feature Overview

### Authentication
- Email + password via Auth0 Universal Login (zero credentials in our code or database)
- One-tap Google SSO via Auth0 Social Connection
- Silent token refresh on page reload — users never see the login screen again unless their session expires
- Full logout with Auth0 server-side session termination

### Authorization — Two Roles, Two Access Levels
| Role | Assigned | Permissions | What It Unlocks |
|---|---|---|---|
| **Customer** | Automatically on first login via Post-Login Action | `create:orders` | Place orders, view profile and order history |
| **Admin** | Manually via Auth0 Dashboard | `read:all_orders` | Full admin dashboard with aggregate metrics across all users |

### Account Linking
If the same email address is used with two different login methods (e.g. sign up with Google, then create an email+password account), Auth0 automatically merges both into a single user profile — preserving all order history in the process. This runs as a dedicated Auth0 Post-Login Action and works in both directions.

### Progressive Profile Collection (4 Forms)
Data is collected across multiple logins with zero friction at signup. Every form is built in the Auth0 Forms editor and runs inside Universal Login — no redirect to a separate page.

| Form | Shown When | Collects |
|---|---|---|
| **A — Basic Profile** | Login 1, email/password users | First name, last name, phone |
| **D — SSO Phone** | Login 1, Google/SSO users | Phone number (the only field Google doesn't supply) |
| **B — Marketing** | Login 2+ | Date of birth, marketing consent |
| **C — Crust Preference** | Login 3+ | Favorite crust (used by Braze for campaign targeting) |

Every submitted value flows to Segment via the post-login Action — which means it flows to Braze automatically. **The login event is the marketing trigger.**

### Email Verification Gate
Unverified users can browse but cannot place orders. The gate is enforced in three independent places:
1. The "Order Now" button on the Home page (UI layer)
2. The `/order` route constructor (Angular router layer)
3. `POST /orders` on the backend (API layer — returns HTTP 403 if `email_verified` claim is false)

### Admin Dashboard
A dedicated `/admin` page shows live aggregate metrics pulled from the Auth0 Management API:
- Total registered users
- Total orders placed
- Conversion rate (users with at least one order)
- Average orders per active user
- Top 5 toppings, sizes, and crusts

Access is protected by two layers: `AuthGuard` (must be authenticated) + `adminGuard` (must have the Admin role in the ID token). Non-admin users are silently redirected home. The backend enforces `read:all_orders` scope on the API level.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Browser — Angular 21 SPA (Vercel)                                 │
│                                                                     │
│   ┌──────────────┐  OAuth2 + PKCE   ┌──────────────────────────┐   │
│   │ auth0-angular│ ◄──────────────► │   Auth0 Universal Login  │   │
│   │     SDK      │  ID + Access +   │                          │   │
│   │              │  Refresh Tokens  │  Post-Login Actions:     │   │
│   └──────┬───────┘                  │  1. account-linking      │   │
│          │                          │  2. post-login-enrich    │   │
│          │  Bearer Access Token     └──────────────────────────┘   │
│          ▼                                                          │
│   ┌───────────────────────────────────────────────────────────┐    │
│   │  NestJS API (Render)                                      │    │
│   │                                                           │    │
│   │  JwtAuthGuard  → RS256 JWKS signature verify             │    │
│   │  ScopesGuard   → check create:orders                     │    │
│   │  Inline check  → check read:all_orders (Admin only)      │    │
│   │                                                           │    │
│   │  POST /orders       → app_metadata.orders (M2M)          │    │
│   │  GET  /admin/metrics → Management API aggregate          │    │
│   └───────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

### How a login actually works — step by step

1. User clicks **Sign In** → Angular redirects to Auth0 Universal Login (PKCE flow, `code_challenge_method=S256`)
2. Auth0 authenticates the user and runs the **Login Flow Actions** in order:
   - `account-linking` — merges duplicate accounts if same email detected
   - `post-login-enrichment` — assigns role, shows progressive form if needed, enriches tokens
3. Auth0 redirects back to the app with an authorization code
4. `auth0-angular` exchanges the code for ID Token, Access Token, and Refresh Token (in memory, never in localStorage)
5. The ID Token carries all custom claims: name, orders, role, email verified, marketing data
6. Every API call to NestJS includes the Access Token as a Bearer header — the HTTP interceptor handles this automatically

### How an order gets placed — step by step

1. Angular `OrderService.placeOrder()` calls `POST /orders` with the Bearer token
2. `JwtAuthGuard` fetches Auth0's JWKS endpoint and verifies the RS256 signature, `iss`, and `aud`
3. `ScopesGuard` checks the `permissions` array for `create:orders`
4. The controller reads `email_verified` from the Access Token — returns 403 if false
5. `OrdersService` calls the Auth0 Management API (M2M token cached in memory) and patches `app_metadata.orders`
6. `201 Created` is returned with the order object
7. The frontend immediately calls `getAccessTokenSilently({ cacheMode: 'off' })` to force a fresh token — the new order appears in the ID Token's claims on the next render, with zero extra API calls

---

## Auth0 Configuration

### Actions (Login Flow)

Two Actions run in sequence on every login:

**1. `account-linking`** (runs first)
- Searches for other verified accounts registered to the same email
- If duplicates exist, selects the best primary (most orders > database connection preferred)
- Links the secondary identity into the primary via `mgmt.users.link()`
- Signals `api.authentication.setPrimaryUser()` so the enrichment Action runs against the unified profile

**2. `post-login-enrichment`** (runs second)

| Block | What It Does |
|---|---|
| **Block 0** | Progressive Profiling Gate — evaluates which form to show (if any) and calls `api.prompt.render()`. One form per login session. |
| **Block 1** | First-Login Role Assignment — calls Management API to assign the Customer role. Also injects `create:orders` permission bridge for the first login (RBAC runs before Actions, so the permission would otherwise be missing on login 1). |
| **Block 2** | Email Verified Claim — injects `email_verified` into the Access Token so the backend can enforce the verification gate without an extra API call. |
| **Block 3** | Order History — injects `app_metadata.orders` into the ID Token so the frontend shows full order history with zero HTTP requests. |
| **Block 4** | Progressive Profile Claims — injects all available `user_metadata` fields (name, phone, DOB, marketing consent, crust preference) into the ID Token. |
| **Block 5** | Roles Claim — injects RBAC role names into the ID Token so the frontend can show role badges and the `adminGuard` can enforce the Admin route. |

Both `onExecutePostLogin` and `onContinuePostLogin` are implemented. `onContinuePostLogin` is required — without it, Auth0 has no handler to resume to after a form and the user gets stranded on Auth0's domain.

### RBAC Objects

| Object | Name | Details |
|---|---|---|
| API | Pizza 42 API | Identifier: `https://api.pizza42.com` |
| Role | Customer | Permission: `create:orders` |
| Role | Admin | Permissions: `create:orders` + `read:all_orders` |
| API Settings | RBAC + Add Permissions to Access Token | Both enabled |

> **First-Login Permissions Gap:** Auth0 evaluates RBAC *before* the Post-Login Action runs. On login 1, the Customer role hasn't been assigned yet, so `create:orders` is missing from the token. Block 1 bridges this by manually injecting the permission for that session only. From login 2 onward, RBAC supplies it natively.

### Auth0 Forms (Progressive Profiling)

| Form ID | Trigger | Fields | Skip Behavior |
|---|---|---|---|
| `PROFILE_FORM` | Login 1, email users | first_name, last_name, phone | No sentinel — form re-appears until completed |
| `PHONE_FORM` | Login 1, SSO users | phone | No sentinel — form re-appears until completed |
| `BD_FORM` | Login 2+ | date_of_birth, marketing_consent | Skip writes `marketing_consent: false` |
| `CRUST_FORM` | Login 3+ | favorite_crust | Skip writes `favorite_crust: 'skipped'` |

---

## Security Design

### Token Storage — No XSS Risk
```
cacheLocation: 'memory'
```
Tokens live exclusively inside the Auth0 SDK's JavaScript closure. They are invisible to DevTools, browser extensions, injected scripts, and XSS payloads. `localStorage` and `sessionStorage` are never used.

**The trade-off:** On page refresh, in-memory tokens are cleared. The SDK automatically calls Auth0's `/authorize` endpoint, which checks the `httpOnly` session cookie (inaccessible to JS) and redirects back with fresh tokens in ~500ms. The user sees no login prompt.

### JWT Validation Chain
```
Auth0 signs with RS256 private key
  → JWKS public key cached by jwks-rsa
    → passport-jwt verifies signature + iss + aud
      → ScopesGuard checks permissions[]
        → Inline check for read:all_orders (Admin routes)
          → Business logic
```
The backend never holds a client secret. Key rotation is automatic.

### Other Security Details
- **CORS** — strict single-origin allowlist via environment variable; only the Vercel domain can send `Authorization` headers
- **M2M credentials** — exist only in Render environment variables, never in the frontend build, never logged
- **Algorithm enforcement** — `algorithms: ['RS256']` in JwtStrategy explicitly rejects HS256 to prevent algorithm confusion attacks
- **OIDC namespacing** — all custom claims use `https://pizza42.com/...` prefix per the OIDC spec to prevent collisions with registered claims
- **Refresh Token Rotation** — enabled with a 10-second reuse interval to handle tab-duplication race conditions

---

## API Reference

| Method | Path | Auth Required | Scope | Description |
|---|---|---|---|---|
| `GET` | `/` | None | — | Health check |
| `POST` | `/orders` | JWT | `create:orders` + email verified | Create order, persist to `app_metadata` |
| `GET` | `/admin/metrics` | JWT | `read:all_orders` | Aggregate user and order statistics |

**Middleware execution order:**
```
HTTP Logger → JwtAuthGuard → ScopesGuard → EmailVerifiedGuard → GlobalExceptionFilter → Controller
```

---

## Frontend Structure

```
src/app/
├── app.config.ts             Auth0 SDK configuration + HTTP interceptor
├── app.routes.ts             Route table — AuthGuard + adminGuard composition
├── core/
│   ├── guards/
│   │   └── admin.guard.ts    adminGuard — checks "Admin" role in ID token claims
│   └── services/
│       ├── order.service.ts  placeOrder() + email verification gate helper
│       └── admin.service.ts  getMetrics() — calls GET /admin/metrics
├── pages/
│   ├── home/                 Landing page + authenticated dashboard (orders from ID token)
│   ├── order/                Pizza builder — size, crust, toppings
│   ├── profile/              Progressive profile — all sections conditionally revealed
│   └── admin/                Admin dashboard — KPI cards + top toppings/sizes/crusts
└── shared/
    ├── navbar/               Shows "Admin" link only when ID token contains Admin role
    └── email-verification-modal/
```

**Key patterns:**
- Angular Signals (`signal()`, `computed()`) for component state — no NgRx
- Auth state via `isAuthenticated$`, `user$`, `idTokenClaims$` observables with `| async`
- All order history comes from the ID Token — zero extra API calls on the home page
- `adminGuard` reads the `https://pizza42.com/roles` claim from `idTokenClaims$` — no API call needed to check authorization

---

## Test Coverage

### Frontend — Vitest (54 tests across 5 suites)
| Suite | What's Tested |
|---|---|
| `EmailVerificationModal` | Input binding, output event emission |
| `NavbarComponent` | Login/logout delegation to Auth0 SDK |
| `HomeComponent` | Orders read from ID Token (zero HTTP), "Order Now" email gate, loading states |
| `OrderComponent` | Initial state, `toggleTopping()`, `placeOrder()` — success, error, and EMAIL_UNVERIFIED paths |
| `OrderService` | `checkEmailVerifiedThenProceed()`, HTTP 201/403/500/network-error paths |

### Backend — Jest (34 tests across 5 suites)
| Suite | What's Tested |
|---|---|
| `AppController` | Health check endpoint |
| `JwtStrategy` | RS256 config, JWKS URI, audience, issuer |
| `ScopesGuard` | Passes with correct scope, 403 without, handles missing metadata |
| `OrdersController` | `POST /orders` route binding and DTO forwarding |
| `OrdersService` | `createOrder()` — persists pizza, crust, size, toppings, UUID generation |

```bash
# Run all tests
cd frontend && npm test
cd backend  && npm test
```

### Auth0 Action — 4 Scenario JSON Files
Located in `infrastructure/auth0-actions/` — paste into the Auth0 Actions test console:

| Scenario | Validates |
|---|---|
| A — First Login | Form A is rendered, token has no claims yet |
| B — Returning User With Orders | Full token enrichment, order history injected |
| C — Unverified Email | `email_verified: false` appears in Access Token |
| D — SSO User | SSO backfill runs, Form D shown for phone collection |

---

## Deployment

### Backend — Render (Node.js Web Service)

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm install && npm run build` |
| Start command | `node dist/main.js` |
| Port | `PORT` env var (auto-assigned) |

Environment variables required:
```
AUTH0_DOMAIN       pizza42-poc-yarin.eu.auth0.com
AUTH0_AUDIENCE     https://api.pizza42.com
M2M_CLIENT_ID      <from Auth0 Dashboard>
M2M_CLIENT_SECRET  <from Auth0 Dashboard>
CORS_ORIGIN        https://pizza42-poc.vercel.app
```

### Frontend — Vercel (Angular SPA)

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Output directory | `dist/frontend/browser` |

`frontend/vercel.json` contains the catch-all rewrite to `index.html` — required for Angular's client-side router to handle deep links without a 404.

### Auth0 — Required Callback URLs

After deploying, add the Vercel production URL to the **Pizza 42 Angular SPA** app settings:
- Allowed Callback URLs
- Allowed Logout URLs
- Allowed Web Origins
- Allowed Origins (CORS)

---

## Running Locally

**Prerequisites:** Node.js 20+, an Auth0 tenant with the resources described above.

```bash
# Backend
cd backend
cp .env.example .env
# Fill in AUTH0_DOMAIN, AUTH0_AUDIENCE, M2M_CLIENT_ID, M2M_CLIENT_SECRET
npm install && npm run start:dev
# → http://localhost:3000

# Frontend (separate terminal)
cd frontend
npm install && npm start
# → http://localhost:4200
```

**Auth0 Action setup:**
1. Actions → Library → Create Action → `post-login-enrichment`
2. Paste `infrastructure/auth0-actions/post-login-enrichment.js`
3. Add secrets: `AUTH0_DOMAIN`, `M2M_CLIENT_ID`, `M2M_CLIENT_SECRET`, `PROFILE_FORM`, `BD_FORM`, `CRUST_FORM`, `PHONE_FORM`
4. Add dependency: `auth0@4.37.0`
5. Deploy, then drag into the Login Flow
6. Repeat for `account-linking.js` — place it **before** `post-login-enrichment` in the flow

---

## Known Limitations (and the Production Path)

This is a POC. Here is what was consciously simplified and how each would be addressed in production.

**Order storage in `app_metadata`**  
Works fine for demos. In production, orders belong in a dedicated database (PostgreSQL keyed by `user.sub`). The Auth0 Management API has rate limits and `app_metadata` is not designed for high-frequency writes.

**Unbounded order array in ID Token**  
Injecting the full `app_metadata.orders` array into every ID Token demonstrates the token enrichment capability clearly. In production, cap the token to the 5 most recent orders and add a `GET /orders` endpoint for paginated history.

**Custom Auth0 domain**  
The app currently authenticates on `pizza42-poc-yarin.eu.auth0.com`. Safari's ITP and Chrome's CHIPS policies can block third-party cookies from this domain. Production requires a custom domain (e.g. `auth.pizza42.com`) so Auth0's session cookies qualify as first-party.

**Single-region Render deployment**  
The free tier cold-starts after 15 minutes of inactivity. A paid Render instance (or Railway/Fly.io) removes this for production.

---

*Built by Yarin Israel Tov — Okta / Auth0 Solution Engineering POC, May 2026*
