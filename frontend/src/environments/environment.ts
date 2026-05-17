export const environment = {
  production: false,
  auth0: {
    domain: 'pizza42-poc-yarin.eu.auth0.com',
    // TODO: Replace with the Client ID from Auth0 Dashboard →
    //       Applications → Pizza 42 Angular SPA → Settings → Client ID
    clientId: 'YOUR_SPA_CLIENT_ID',
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience: 'https://api.pizza42.com',
      // offline_access requests a refresh token enabling silent re-authentication
      // without a full redirect to the Auth0 login page.
      scope: 'openid profile email offline_access',
    },
  },
  apiUrl: 'http://localhost:3000',
};
