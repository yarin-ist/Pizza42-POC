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
    // SECURITY DECISION: cacheLocation: 'memory'
    //
    // WHY NOT 'localstorage':
    //   localStorage is accessible to every JavaScript execution context on the
    //   page — including third-party scripts, browser extensions, and any XSS
    //   payload. A single injected script line:
    //       localStorage.getItem('@@auth0spajs@@::...')
    //   retrieves both the access token AND the refresh token. The refresh token
    //   is particularly dangerous because it never expires on its own — an
    //   attacker can silently re-issue access tokens indefinitely.
    //
    // WHY 'memory' IS CORRECT:
    //   The SDK stores tokens inside a JavaScript closure in heap memory.
    //   - XSS cannot read heap memory across scope boundaries.
    //   - DevTools > Application > LocalStorage shows nothing sensitive.
    //   - This is Auth0's own recommendation for SPAs in their security guidance.
    //
    // TRADEOFF — page refresh:
    //   Memory is cleared on page refresh. Without refresh tokens, the user would
    //   be redirected to Auth0 on every F5. We solve this with:
    //     useRefreshTokens: true + offline_access scope
    //   When the page loads and memory is empty, the SDK checks for an active
    //   Auth0 session (via a silent /authorize iframe call using Auth0's own
    //   httpOnly session cookie). If the session exists, it silently issues a new
    //   access token — the user sees nothing, the app continues without redirect.
    //   The refresh token itself is stored by Auth0 server-side and exchanged
    //   via a backchannel POST /oauth/token — never in the browser's storage.
    //
    // REMAINING TRADEOFF:
    //   If Auth0's own session cookie expires (default 7 days of inactivity),
    //   the user will be redirected to login. This is the correct security
    //   behaviour — it is equivalent to an httpOnly session cookie timeout.
    provideAuth0({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      authorizationParams: environment.auth0.authorizationParams,
      useRefreshTokens: true,
      cacheLocation: 'memory',
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
