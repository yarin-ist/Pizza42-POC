import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAuth0, authHttpInterceptorFn } from '@auth0/auth0-angular';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

// ─── Token Cache: Memory (Auth0 recommended, zero XSS risk) ───────────────────
//
// SECURITY DECISION — cacheLocation: 'memory'
//
//   Tokens are stored exclusively inside the Auth0 SDK's JavaScript closure.
//   No other script on the page — including third-party scripts, browser
//   extensions, or an XSS payload — can read them. DevTools > Application >
//   LocalStorage shows nothing. This is Auth0's own published recommendation
//   for SPAs and the only option with zero XSS exposure.
//
// WHY NOT localStorage / sessionStorage:
//   Both are readable by any same-origin JavaScript. One injected script line
//   is enough to exfiltrate the access token and refresh token. Unacceptable
//   for a security-conscious product regardless of blast-radius mitigation.
//
// UX — LANDING FIRST + SILENT F5 RESTORE:
//   First visit in a tab: landing page only; Auth0 opens when the user clicks
//   Sign In (no automatic redirect to Universal Login).
//   After login, sessionStorage flag _auth_session marks this tab as "returning".
//   On F5, memory tokens are cleared but HomeComponent sees _auth_session and
//   calls loginWithRedirect() once; Auth0's httpOnly session cookie restores
//   tokens without showing the login form (~0.5 s spinner, no landing flash).
//   On logout, _auth_session is cleared and _auth_redir blocks silent re-auth.
//
// PRODUCTION PATH:
//   Deploy Auth0 on a Custom Domain (e.g. auth.pizza42.com, same eTLD+1 as
//   the app). Auth0's session cookie then qualifies as first-party, enabling
//   the SDK's silent iframe re-auth even with strict third-party cookie
//   policies (Safari ITP, Chrome CHIPS). Combined with a Content Security
//   Policy that whitelists only trusted script sources, this setup achieves
//   the strongest possible security posture for a browser-based SPA.

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),

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
