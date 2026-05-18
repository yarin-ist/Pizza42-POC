import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAuth0, authHttpInterceptorFn } from '@auth0/auth0-angular';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

// ─── Token Cache: Session Storage ─────────────────────────────────────────────
//
// SECURITY DECISION — why not localStorage, why not memory:
//
//   localStorage  — Persistent across browser restarts, shared across all tabs
//                   and windows. A stolen token survives indefinitely until it
//                   expires. Unacceptable for a security-conscious product.
//
//   memory        — Most secure: tokens live only in a JS closure, XSS cannot
//                   read them. BUT: tokens are erased on every page refresh (F5).
//                   The SDK recovers by firing a silent /authorize iframe using
//                   Auth0's httpOnly session cookie. In modern browsers with
//                   strict third-party cookie policies (Safari ITP, Chrome CHIPS),
//                   that iframe is blocked because Auth0 is a different origin than
//                   localhost. Silent re-auth fails → user sees the unauthenticated
//                   landing page on every refresh. Broken UX for a live demo.
//
//   sessionStorage — The right tradeoff for this POC:
//                   • Tab-scoped: each browser tab gets its own independent store.
//                     A token stolen from Tab A cannot be replayed in Tab B.
//                   • Session-scoped: cleared automatically when the user closes
//                     the tab or the browser. Tokens cannot outlive the session.
//                   • Survives page refresh (F5) within the same tab — UX intact.
//                   • XSS can still read sessionStorage (same-origin JS), so the
//                     XSS risk is not eliminated, only narrowed in time and scope.
//
// PRODUCTION PATH:
//   Deploy Auth0 on a Custom Domain (auth.pizza42.com) so the session cookie is
//   first-party to the app. The silent iframe then works in all browsers.
//   Switch to cacheLocation: 'memory' and add a strict Content Security Policy
//   (CSP) to eliminate the XSS vector entirely.
const sessionStorageCache = {
  set(key: string, entry: object): void {
    sessionStorage.setItem(key, JSON.stringify(entry));
  },
  get<T>(key: string): T | undefined {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    try { return JSON.parse(raw) as T; } catch { return undefined; }
  },
  remove(key: string): void {
    sessionStorage.removeItem(key);
  },
  allKeys(): string[] {
    return Object.keys(sessionStorage);
  },
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),

    provideAuth0({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      authorizationParams: environment.auth0.authorizationParams,
      useRefreshTokens: true,
      cache: sessionStorageCache,
      httpInterceptor: {
        // authHttpInterceptorFn will automatically attach Bearer tokens to any
        // outbound request whose URL starts with the API base URL.
        allowedList: [`${environment.apiUrl}/*`],
      },
    }),

    // Auth0's functional HTTP interceptor — zero boilerplate in components.
    // Every HTTP request to environment.apiUrl automatically gets the Bearer token.
    provideHttpClient(withInterceptors([authHttpInterceptorFn])),
  ],
};
