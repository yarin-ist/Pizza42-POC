import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAuth0, authHttpInterceptorFn } from '@auth0/auth0-angular';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),

    // ─── Auth0 SDK Configuration ──────────────────────────────────────────────
    //
    // CACHE LOCATION: 'localstorage'
    //
    // SECURITY TRADEOFF — documented intentionally:
    //   localStorage is readable by any JavaScript running on the page. An XSS
    //   payload could extract the access token and refresh token in one line:
    //       localStorage.getItem('@@auth0spajs@@::...')
    //   The ideal setting is 'memory' which stores tokens in a JS closure
    //   inaccessible to other scripts. Auth0 recommends 'memory' for SPAs.
    //
    // WHY WE USE 'localstorage' FOR THIS POC:
    //   With 'memory', tokens are erased on every page refresh (F5). The SDK
    //   recovers by firing a silent /authorize request in a hidden iframe using
    //   Auth0's httpOnly session cookie. In modern browsers with strict
    //   third-party cookie policies (Safari ITP, Chrome CHIPS), that iframe
    //   cannot read the Auth0 session cookie, so the silent re-auth fails and
    //   the user is shown the unauthenticated landing page — effectively logged
    //   out on every refresh. This is unacceptable UX for a live POC demo.
    //
    // MITIGATION:
    //   The access token has a short lifetime (default 86400s / 24h in Auth0).
    //   Refresh token rotation is enabled: a stolen refresh token can only be
    //   used once before it is invalidated. These controls limit the blast
    //   radius of an XSS attack and are documented here for the interview.
    //
    // PRODUCTION PATH:
    //   Deploy behind a Content Security Policy (CSP) that whitelists only
    //   trusted script sources, eliminating the XSS vector. Then switch to
    //   cacheLocation: 'memory' once third-party cookie restrictions are
    //   solved (e.g. Auth0's Custom Domains + SameSite=None; Secure).
    provideAuth0({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      authorizationParams: environment.auth0.authorizationParams,
      useRefreshTokens: true,
      cacheLocation: 'localstorage',
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
