# Pizza 42 — Auth0 Identity POC

> A Solution Engineering proof-of-concept demonstrating Auth0's full identity platform for a fictional pizza ordering company.
> Built as a technical take-home for an Okta / Auth0 interview.

**Live demo:** https://pizza42-poc.vercel.app  
**Backend API:** https://pizza42-api-r771.onrender.com  
**Repository:** https://github.com/yarin-ist/Pizza42-POC

---

## Table of Contents

1. [Overview](#overview)
2. [Business Requirements & How They Are Met](#business-requirements--how-they-are-met)
3. [Architecture](#architecture)
4. [Technology Choices](#technology-choices)
5. [Security Posture](#security-posture)
6. [Auth0 Integration Deep-Dive](#auth0-integration-deep-dive)
7. [Progressive Profiling — Marketing Enrichment](#progressive-profiling--marketing-enrichment)
8. [API Design & Middleware](#api-design--middleware)
9. [Frontend Architecture](#frontend-architecture)
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Known POC Limitations & Production Path](#known-poc-limitations--production-path)
13. [Running Locally](#running-locally)

---

## Overview

Pizza 42 is a pizza ordering SPA that uses Auth0 as its identity backbone. The challenge asked for a solution that simultaneously satisfies three internal stakeholder groups:

| Stakeholder | Pain Point | Solution |
|---|---|---|
| **Security team** | Storing credentials raises liability and complexity | Auth0 owns all credential management; the app never touches a password |
| **Product team** | Frictionless, customisable login; turnkey password reset; social login | Auth0 Universal Login with Google SSO; built-in forgot-password flow; custom branding |
| **Marketing team** | Enrich customer data progressively to drive campaigns | Auth0 Forms shown at login 1, 2, 3 collecting name, DOB, consent, crust preference |

---

## Business Requirements & How They Are Met

### Authentication

| Requirement | Implementation |
|---|---|
| Email + password login | Auth0 Universal Login (database connection) |
| Google SSO | Auth0 Social Connection — Google OAuth 2.0 |
| Logout with session termination | `AuthService.logout({ logoutParams: { returnTo: window.location.origin } })` — clears Auth0 server-side session |
| Silent re-auth on page refresh | `useRefreshTokens: true` + auto `loginWithRedirect()` in `HomeComponent` constructor; Auth0's httpOnly session cookie handles the round-trip without showing the login form |

### Authorization (RBAC)

| Requirement | Implementation |
|---|---|
| "Customer" role assigned on first login | Auth0 Action Block 1 calls Management API to assign the role |
| `create:orders` permission | Attached to the Customer role in Auth0 Dashboard; also injected directly for login-1 users (permissions gap bridge — see below) |
| `/order` route protected | Angular `AuthGuard` + email-verification component guard |
| Backend route protected | NestJS `JwtAuthGuard` + `ScopesGuard` check `create:orders` on every `POST /orders` |

### Email Verification

| Requirement | Implementation |
|---|---|
| Verified gate on order button | Profile page hides "Order now" if `email_verified` is false |
| Verified gate on `/order` route | `OrderComponent` constructor redirects unverified users to home |
| Backend enforcement | `POST /orders` returns HTTP 403 when the Access Token's `https://pizza42.com/email_verified` claim is false |
| Unverified UX | Modal with resend instructions; no silent failure |

### Token Security

| Requirement | Implementation |
|---|---|
| No XSS exposure | `cacheLocation: 'memory'` — tokens live only in the SDK's JS closure, never in `localStorage` or `sessionStorage` |
| Refresh Token Rotation | Enabled in Auth0 Dashboard with 10-second reuse interval |
| Bearer token on every API call | `authHttpInterceptorFn` intercepts all requests to `environment.apiUrl` |
| RS256 JWT validation | Backend fetches public keys from Auth0's JWKS endpoint at startup; private key never leaves Auth0 |
| Algorithm confusion prevention | `algorithms: ['RS256']` — HS256 tokens are explicitly rejected |
| OIDC-compliant custom claims | All custom claims namespaced under `https://pizza42.com/...` |

### Order Management

| Requirement | Implementation |
|---|---|
| Pizza builder UI | Size, crust, toppings selection with reactive Angular signals |
| Order persistence | `POST /orders` writes to `app_metadata.orders` via Management API |
| Order history in ID token | Auth0 Action Block 3 injects `app_metadata.orders` into the ID token — zero extra HTTP calls from the frontend |
| Immediate order display | Silent token refresh (`getAccessTokenSilently({ cacheMode: 'off' })`) after successful order |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Angular SPA — Vercel)                             │
│                                                             │
│  ┌─────────────┐  PKCE Auth Code  ┌───────────────────┐    │
│  │  @auth0/    │ ◄──────────────► │  Auth0 Universal  │    │
│  │  auth0-     │   ID + Access    │  Login            │    │
│  │  angular    │   + Refresh      │  + Post-Login     │    │
│  └──────┬──────┘   Tokens         │    Action         │    │
│         │                         └───────────────────┘    │
│         │  Bearer Access Token                             │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  NestJS API (Render)                                │   │
│  │                                                     │   │
│  │  JwtAuthGuard → RS256 JWKS verify                  │   │
│  │  ScopesGuard  → check create:orders                │   │
│  │  EmailVerifiedGuard → check email_verified claim   │   │
│  │                                                     │   │
│  │  POST /orders → Management API → app_metadata      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Request lifecycle for `POST /orders`

1. Angular calls `orderService.placeOrder(dto)` — the HTTP interceptor attaches `Authorization: Bearer <access_token>`
2. NestJS `JwtAuthGuard` calls `passport-jwt` which fetches Auth0's JWKS endpoint and verifies the RS256 signature, `iss`, and `aud`
3. `ScopesGuard` checks the token's `permissions` array for `create:orders`
4. `OrdersController` reads the `sub` claim from `req.user` and calls `OrdersService.createOrder(sub, dto)`
5. `OrdersService` calls the Auth0 Management API (M2M token cached in memory) to patch `app_metadata.orders`
6. `201 Created` with the new order object is returned
7. Frontend calls `getAccessTokenSilently({ cacheMode: 'off' })` to force a silent token refresh — the new order appears in the ID token's `https://pizza42.com/orders` claim immediately

---

## Technology Choices

### Frontend — Angular 21

Chosen over React/Vue for this POC because:
- **TypeScript-first** with strict mode enabled — matches Auth0 SDK type safety expectations
- **Angular signals** for reactive state without `ChangeDetectionStrategy.OnPush` boilerplate
- **`@auth0/auth0-angular`** SDK provides first-class `AuthGuard`, HTTP interceptor, and observables (`isAuthenticated$`, `idTokenClaims$`, `user$`) that integrate cleanly with Angular's DI
- **RxJS `combineLatest`** + `take(1)` patterns for clean one-shot auth state reads

Styling: **Tailwind CSS** with a custom glassmorphism design language — dark background with purple/red radial gradients, `backdrop-blur` glass cards.

### Backend — NestJS (Node.js)

Chosen because:
- **Decorator-driven** architecture mirrors how Auth0 documentation presents guard patterns (`@UseGuards`, `@RequiredScopes`)
- **`passport-jwt` + `jwks-rsa`** is the canonical Auth0-recommended Node.js validation stack
- **`ConfigModule`** provides environment variable injection with `.env` support — easy to swap secrets between local and Render
- **In-memory order store** (POC only) — M2M token is cached in memory to prevent Auth0 rate-limiting

### Identity — Auth0

- **Universal Login** (not Embedded) — Auth0 owns the credential page; no passwords ever pass through our code
- **Post-Login Action** (`post-login-enrichment.js`) — single action handling role assignment, token enrichment, and progressive profiling form dispatch
- **Auth0 Forms** — low-code form builder for collecting marketing data without custom UI development

---

## Security Posture

### Token Storage — zero XSS

```
cacheLocation: 'memory'
```

Tokens are stored exclusively inside the Auth0 SDK's JavaScript closure. No same-origin script — including third-party analytics, browser extensions, or an XSS payload — can enumerate or read them. `DevTools > Application > LocalStorage` shows nothing related to auth.

**Why not `localStorage`?** A single injected script line (`localStorage.getItem(...)`) exfiltrates every token. Unacceptable for a security product demo regardless of other mitigations.

**Why not `sessionStorage`?** Same-origin readable; the XSS blast radius is identical to `localStorage`.

**UX trade-off:** On F5 (page refresh) the in-memory tokens are cleared. The app calls `loginWithRedirect()` automatically; Auth0 checks its `httpOnly` server-side session cookie (never touching JS storage) and, if valid, redirects back with fresh tokens in ~500ms. No login form is shown to the user.

### JWT Validation Chain

```
RS256 signed by Auth0 private key
  → JWKS endpoint (/.well-known/jwks.json)
    → jwks-rsa caches public key
      → passport-jwt verifies signature + iss + aud
        → ScopesGuard checks permissions[]
          → EmailVerifiedGuard checks email_verified claim
            → business logic
```

The NestJS backend never holds a shared secret. Key rotation is automatic — `jwks-rsa` re-fetches on cache miss.

### CORS

```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
});
```

Strict single-origin allowlist driven by environment variable. In production, only the Vercel deployment URL is permitted to send `Authorization` headers cross-origin.

### M2M Credential Isolation

The Auth0 Management API credentials (`M2M_CLIENT_ID`, `M2M_CLIENT_SECRET`) exist only in Render environment variables. They are never sent to the browser, never included in the frontend build, and never logged. The M2M token returned by Auth0 is cached in-process to prevent rate-limit exhaustion.

### Secrets never in git

```
.env          → root .gitignore (confirmed)
backend/.env  → backend/.gitignore (safety net)
```

A `.env.example` documents all required keys with placeholder values for onboarding.

---

## Auth0 Integration Deep-Dive

### Protocols

| Protocol | Role in this app |
|---|---|
| **OAuth 2.0 Authorization Code + PKCE** | All login flows. PKCE (`code_challenge_method=S256`) prevents authorization code interception — the standard for public clients (SPAs) per RFC 7636 and OAuth 2.1 |
| **OIDC** | The `openid` scope triggers ID token issuance. Custom claims are namespaced under `https://pizza42.com/...` per the OIDC specification to avoid collisions with standard claims |
| **Refresh Token Rotation (RTR)** | `offline_access` scope + `useRefreshTokens: true`; each use of a refresh token issues a new one and invalidates the old. 10-second reuse interval handles tab-duplication race conditions |
| **RS256 asymmetric JWT signing** | Auth0 signs tokens with its private key; the backend validates with Auth0's public JWKS. HS256 is explicitly rejected in `JwtStrategy` to prevent algorithm confusion attacks |

### Post-Login Action — `post-login-enrichment.js`

The entire identity enrichment pipeline runs in a single Auth0 Action attached to the Login flow. It executes in two entry points:

```
onExecutePostLogin  — runs on every new login
onContinuePostLogin — runs after any Auth0 Form completes (submit or skip)
```

Both entry points run the same token-injection blocks (1–5). `onContinuePostLogin` is required — without it, Auth0 has no handler to resume to after a form and the user is stranded on Auth0's domain.

**Execution order:**

```
Block 0  Progressive Profiling Gate (onExecutePostLogin only)
  ├─ SSO backfill: if Google login, write given_name/family_name to user_metadata
  ├─ Form A: show if first_name missing AND no SSO name (login 1+)
  ├─ Form D: show if SSO user and phone missing (collect what Google can't supply)
  ├─ Form B: show if marketing_consent missing (login 2+)
  └─ Form C: show if favorite_crust missing (login 3+)

Block 1  First-Login Role Assignment
  └─ Management API: assign "Customer" role + inject create:orders permission bridge

Block 2  Email Verified Claim → Access Token

Block 3  Order History → ID Token (from app_metadata.orders)

Block 4  Progressive Profile Claims → ID Token
  └─ first_name, last_name, phone, date_of_birth, marketing_consent, favorite_crust

Block 5  Roles Claim → ID Token
```

### First-Login Permissions Gap — and how we bridge it

Auth0 evaluates RBAC permissions **before** the Post-Login Action runs. On a user's very first login, RBAC captures zero roles (the Customer role is assigned inside the Action). Without a bridge, the first-login Access Token would have an empty `permissions` array, and `POST /orders` would return 403.

**Bridge (Block 1):**
```javascript
// logins_count === 1: RBAC ran before us, assign role AND manually inject
api.accessToken.setCustomClaim('permissions', ['create:orders']);
```

From login 2 onward, RBAC has picked up the Customer role and supplies `create:orders` natively. The manual injection is skipped.

This is documented explicitly in the Action comments so the next engineer understands the asymmetry.

### RBAC Configuration

| Object | Setting |
|---|---|
| API Identifier | `https://api.pizza42.com` |
| Role | `Customer` |
| Permission | `create:orders` on `https://api.pizza42.com` |
| "Enable RBAC" | On |
| "Add Permissions to Access Token" | On |

---

## Progressive Profiling — Marketing Enrichment

Auth0 Forms are rendered inside the Universal Login flow (no redirect to a separate URL). The form's own built-in Flow persists submitted values directly to `user_metadata` before `onContinuePostLogin` is called.

| Form | Trigger | Data collected | Storage |
|---|---|---|---|
| A — Basic Profile | Login 1, email/password users | first_name, last_name, phone | `user_metadata` |
| D — SSO Phone | Login 1, SSO users missing phone | phone | `user_metadata` |
| B — Marketing | Login 2+ | date_of_birth, marketing_consent | `user_metadata` |
| C — Crust Preference | Login 3+ | favorite_crust | `user_metadata` |

**Skip handling:** Skip paths write sentinel values (`marketing_consent: false`, `favorite_crust: 'skipped'`) so the form is not shown again. Without sentinels, the condition would remain true and the form would re-appear on every login.

**SSO backfill:** Google provides `given_name` and `family_name` as standard OIDC claims. On the first SSO login, the Action writes these into `user_metadata` so Form A is permanently skipped and the name claim is available from login 1.

**Progressive reveal on the profile page:** The Angular profile page uses `@if` on each namespaced ID token claim. Sections are hidden until the corresponding form has been completed, providing a clean, uncluttered profile that grows with the user.

---

## API Design & Middleware

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | None | Health check |
| `POST` | `/orders` | JWT + `create:orders` scope + email verified | Create order, persist to `app_metadata` |

### Middleware stack (in execution order)

```
HTTP Logger        → logs METHOD path STATUS duration (e.g. POST /orders 201 142ms)
JwtAuthGuard       → passport-jwt RS256 validation
ScopesGuard        → checks permissions[] for @RequiredScopes decorator value
EmailVerifiedGuard → checks https://pizza42.com/email_verified claim → 403 if false
GlobalExceptionFilter → normalises all errors to { statusCode, message, path, timestamp }
```

### M2M Token Caching

The Management API client (`ManagementClient` from `auth0` npm package) handles M2M token caching internally. Auth0 recommends not requesting a new M2M token on every operation; the SDK's built-in cache prevents rate-limit exhaustion during high-frequency login bursts. The `ManagementClient` is instantiated per-Action execution (stateless serverless model) but Auth0's token endpoint responds with `expires_in` so the SDK reuses cached tokens within the expiry window.

---

## Frontend Architecture

```
src/app/
├── app.config.ts          Auth0 SDK + HTTP interceptor configuration
├── app.routes.ts          Route definitions with AuthGuard
├── core/
│   └── services/
│       └── order.service.ts   placeOrder() + checkEmailVerifiedThenProceed()
├── pages/
│   ├── home/              Dashboard — order history from ID token, Order Now gate
│   ├── order/             Pizza builder — size/crust/toppings, email guard in constructor
│   └── profile/           Progressive profile — all sections conditionally visible
└── shared/
    ├── navbar/            Avatar → /profile link, display name from custom claims
    └── email-verification-modal/   Reusable modal for unverified email paths
```

### State management

No NgRx or external state library. Angular 19 signals (`signal()`, `computed()`) handle component-local state. Auth state is derived from the Auth0 SDK's own observables (`isAuthenticated$`, `user$`, `idTokenClaims$`) via `| async` pipe and `combineLatest`.

### Display name priority

```
idTokenClaims$['https://pizza42.com/first_name']
  || user.given_name      (Google SSO native field)
  || user.email           (fallback)
```

This ensures the custom name collected via Form A takes precedence over whatever the provider supplied, while still showing something meaningful before the form has been completed.

---

## Testing

### Frontend — Vitest (54 tests, 5 suites)

| Suite | Coverage |
|---|---|
| `EmailVerificationModalComponent` | `@Output` event emission, `@Input` binding |
| `NavbarComponent` | `login()`, `logout()` delegate to Auth0 SDK |
| `HomeComponent` | `orders$` reads ID token (zero HTTP), `onOrderNow()` email gate, loading states |
| `OrderComponent` | Initial state, `toggleTopping()`, `placeOrder()` success/error/EMAIL_UNVERIFIED paths |
| `OrderService` | `checkEmailVerifiedThenProceed()`, `placeOrder()` HTTP 201/403/500/network-error paths |

### Backend — Jest (34 tests, 5 suites)

| Suite | Coverage |
|---|---|
| `AppController` | Health check endpoint |
| `JwtStrategy` | RS256 configuration, JWKS URI, audience, issuer |
| `ScopesGuard` | Passes with correct scope, 403 without, handles missing metadata |
| `OrdersController` | `POST /orders` route binding, DTO forwarding |
| `OrdersService` | `createOrder()` persists all fields (pizza, crust, size, toppings), UUID generation |

Run all tests:
```bash
cd frontend && npm test
cd backend  && npm test
```

### Auth0 Action — manual scenario tests

Four scenario JSON files in `infrastructure/auth0-actions/` are pasted into the Auth0 Actions test console:

| Scenario | Validates |
|---|---|
| A — First Login | Form A rendered, no token claims yet |
| B — Returning User With Orders | Full token enrichment, order history claim |
| C — Unverified Email | `email_verified: false` in Access Token |
| D — SSO User | SSO backfill, Form D rendered for phone |

---

## Deployment

### Backend — Render (Node web service)

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm install && npm run build` |
| Start command | `node dist/main.js` |
| Port | Auto-assigned via `PORT` env var |

Required environment variables on Render:

```
AUTH0_DOMAIN      pizza42-poc-yarin.eu.auth0.com
AUTH0_AUDIENCE    https://api.pizza42.com
M2M_CLIENT_ID     <from Auth0 Dashboard>
M2M_CLIENT_SECRET <from Auth0 Dashboard>
CORS_ORIGIN       https://pizza42-poc.vercel.app
```

### Frontend — Vercel (Angular SPA)

| Setting | Value |
|---|---|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Output directory | `dist/frontend/browser` |

`frontend/vercel.json` contains the SPA rewrite rule that routes all paths to `index.html`, enabling Angular's client-side router to handle deep links and page refreshes without 404s.

### Auth0 — required production URL configuration

After deploying, add the Vercel URL to the **Pizza 42 Angular SPA** application settings:

- Allowed Callback URLs
- Allowed Logout URLs
- Allowed Web Origins
- Allowed Origins (CORS)

---

## Known POC Limitations & Production Path

### Token Bloat Anti-Pattern

**Current implementation:** the full `app_metadata.orders` array is injected into the ID token on every login (Action Block 3). This is intentional for the POC — it satisfies the requirement for order history display with zero frontend HTTP calls and demonstrates the token enrichment capability.

**Production concern:** ID tokens travel in every HTTP response header and are decoded on every page load. An unbounded array of orders will eventually exceed JWT size limits (~8 KB is a common infrastructure ceiling) and degrade performance.

**Production solution:**
1. Cap the token claim to the 5 most recent orders: `orders.slice(-5)`
2. Add a `GET /orders` endpoint that returns paginated full history from a database (PostgreSQL, DynamoDB, etc.)
3. Replace `app_metadata.orders` (Auth0 user store, not designed for high-write workloads) with a dedicated orders table keyed by `user.sub`

### In-Memory Order Store

Orders are persisted to `app_metadata` via the Management API, which uses Auth0's user store. This is appropriate for a POC but not for production:

- Auth0 Management API has rate limits (varies by plan)
- `app_metadata` is not designed for frequent writes
- No pagination, sorting, or querying capability

**Production solution:** a dedicated database (e.g. PostgreSQL on Render) with the `user.sub` as a foreign key.

### Single Region / No CDN

The Render free tier runs in a single region and cold-starts after 15 minutes of inactivity. For a production deployment, use a paid Render instance or migrate to Railway/Fly.io with persistent uptime.

### No Custom Domain

Auth0 session cookies are served from `pizza42-poc-yarin.eu.auth0.com`. With strict third-party cookie policies (Safari ITP, Chrome CHIPS) a custom domain (e.g. `auth.pizza42.com`) is needed so Auth0's cookies qualify as first-party. The code comment in `app.config.ts` documents this as the production hardening path.

---

## Running Locally

### Prerequisites

- Node.js 20+
- An Auth0 tenant with the resources described in the Auth0 Configuration section

### Backend

```bash
cd backend
cp .env.example .env
# Fill in AUTH0_DOMAIN, AUTH0_AUDIENCE, M2M_CLIENT_ID, M2M_CLIENT_SECRET
npm install
npm run start:dev
```

API available at `http://localhost:3000`.

### Frontend

```bash
cd frontend
npm install
npm start
```

SPA available at `http://localhost:4200`.

### Auth0 Action

1. Open Auth0 Dashboard → Actions → Library → `post-login-enrichment`
2. Paste the contents of `infrastructure/auth0-actions/post-login-enrichment.js`
3. Add the required secrets: `AUTH0_DOMAIN`, `M2M_CLIENT_ID`, `M2M_CLIENT_SECRET`, `PROFILE_FORM`, `BD_FORM`, `CRUST_FORM`, `PHONE_FORM`
4. Set dependency: `auth0` @ `4.37.0`
5. Click **Deploy**

---

*Built by Yarin — Auth0 Solution Engineering POC, May 2026*
