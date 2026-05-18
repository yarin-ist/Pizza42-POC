export const environment = {
  production: true,
  auth0: {
    domain: 'pizza42-poc-yarin.eu.auth0.com',
    clientId: 'NnYjPgQG1aNlM6XTONR7vUOxXReumJpF',
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience: 'https://api.pizza42.com',
      scope: 'openid profile email offline_access',
    },
  },
  // ── Production API URL ──────────────────────────────────────────────────────
  // Points at the Render-hosted NestJS service.
  // If you chose a different service name on Render, update this value and
  // commit before Vercel re-deploys.
  apiUrl: 'https://pizza42-api.onrender.com',
};
