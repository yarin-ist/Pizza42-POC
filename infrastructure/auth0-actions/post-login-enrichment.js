const { ManagementClient } = require('auth0');

/**
 * Auth0 Post-Login Action — Pizza 42 Token Enrichment
 *
 * Handles three responsibilities in a single execution context:
 *   1. First-login customer role assignment + permissions gap bridge
 *   2. Email-verified claim injection into the Access Token (every login)
 *   3. Order history injection into the ID Token (every login)
 *
 * Secrets required in the Auth0 Actions Secrets Vault:
 *   AUTH0_DOMAIN     — e.g. pizza42-poc-yarin.eu.auth0.com (no https:// prefix)
 *   M2M_CLIENT_ID    — Client ID of the "NestJS Management Sync" M2M application
 *   M2M_CLIENT_SECRET — Client Secret of the same M2M application
 *
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onExecutePostLogin = async (event, api) => {

  // =========================================================================
  // BLOCK 1 — First-Login Role Assignment (runs exactly once per user)
  // =========================================================================
  if (event.stats.logins_count === 1) {
    // The auth0 ManagementClient is natively available in the Actions runtime.
    // Credentials are loaded from the Action's encrypted Secrets Vault —
    // never hardcoded or stored in source control.
    const mgmt = new ManagementClient({
      domain: event.secrets.AUTH0_DOMAIN,
      clientId: event.secrets.M2M_CLIENT_ID,
      clientSecret: event.secrets.M2M_CLIENT_SECRET,
    });

    // Fetch all roles and find "Customer" by name rather than by hardcoded ID.
    // This keeps the Action portable: if the role ID ever changes (e.g. after
    // a tenant export/import), the name-based lookup still resolves correctly.
    const { data: roles } = await mgmt.roles.getAll();
    const customerRole = roles.find((r) => r.name === 'Customer');

    if (customerRole) {
      await mgmt.users.assignRoles(
        { id: event.user.user_id },
        { roles: [customerRole.id] }
      );
    }

    // PERMISSIONS GAP BRIDGE:
    // Auth0's RBAC pipeline runs BEFORE this Action and captured a snapshot of
    // the user's roles at login start. At that point the user had zero roles, so
    // the pipeline produced permissions: []. The role assignment above takes
    // effect on the NEXT login when RBAC re-reads the database.
    //
    // To prevent the user from being locked out of ordering on their very first
    // session, we manually inject create:orders into this session's access token.
    // From the second login onward, RBAC supplies this permission automatically
    // and this block does not execute again.
    api.accessToken.setCustomClaim('permissions', ['create:orders']);
  }

  // =========================================================================
  // BLOCK 2 — Email Verified Claim (runs on every login)
  // =========================================================================
  // Inject email_verified into the Access Token under a strict OIDC URI namespace.
  // The https://pizza42.com/ prefix is mandatory — OIDC spec forbids adding
  // arbitrary top-level claims to tokens. The namespace prevents collision with
  // registered OIDC claims (sub, iss, aud, etc.).
  //
  // The Phase 2 NestJS backend reads this claim from req.user to enforce the
  // email-verification business rule. If the value is false or the claim is
  // absent, the /orders endpoint returns HTTP 403 Forbidden.
  api.accessToken.setCustomClaim(
    'https://pizza42.com/email_verified',
    event.user.email_verified
  );

  // =========================================================================
  // BLOCK 3 — Order History in ID Token (runs on every login)
  // =========================================================================
  // ARCHITECTURAL NOTE — TOKEN BLOAT ANTI-PATTERN:
  // Injecting an unbounded array into the ID Token is a known anti-pattern.
  // In production, a growing orders array will eventually exceed the 8 KB HTTP
  // header size limit, causing 431 "Request Header Fields Too Large" failures
  // at the load balancer or CDN layer before the application even sees the request.
  //
  // The correct production design:
  //   - Cap this claim at the 5 most recent orders for display purposes.
  //   - Retrieve full history via a paginated GET /orders API endpoint.
  //
  // This unbounded injection is implemented HERE ONLY to satisfy
  // POC Requirement #10: "Add the order history of a user to their ID token
  // when they login." The architectural defense above will be presented
  // explicitly during the panel Q&A.
  const orders = event.user.app_metadata?.orders || [];
  api.idToken.setCustomClaim('https://pizza42.com/orders', orders);
};
