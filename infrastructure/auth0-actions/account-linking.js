const { ManagementClient } = require('auth0');

//
// Auth0 Post-Login Action — Account Linking
//
// Problem this solves:
//   Auth0 creates a separate user record for each login method by default.
//   If a user signs up with email+password, then logs in via Google using the
//   same email, they end up with two accounts: separate user_ids, separate
//   order history, separate metadata. This Action automatically merges them
//   into one primary user the moment the second method is used.
//
// How it works:
//   1. After every login, search for other verified accounts with the same email.
//   2. Pick the best primary (most order history → database connection preferred).
//   3. Link the current (secondary) identity into the primary via Management API.
//   4. Signal Auth0 to resume the session as the primary user.
//
// Safety:
//   - Only runs if the current user's email is verified (prevents malicious
//     pre-registration of an email to hijack someone else's social account).
//   - Only links to other accounts with verified emails (same safety rule).
//   - Idempotent: if already linked, the Management API returns a no-op.
//
// Setup:
//   - Place this Action BEFORE post-login-enrichment in the Login flow.
//   - Uses the same Secrets as post-login-enrichment:
//       AUTH0_DOMAIN, M2M_CLIENT_ID, M2M_CLIENT_SECRET
//   - Pin auth0 dependency to the same version: auth0@4.37.0
//

exports.onExecutePostLogin = async (event, api) => {
  // Guard: linking only makes sense for verified emails.
  // An unverified email user cannot prove ownership of the address.
  if (!event.user.email_verified) return;

  const mgmt = new ManagementClient({
    domain:       event.secrets.AUTH0_DOMAIN,
    clientId:     event.secrets.M2M_CLIENT_ID,
    clientSecret: event.secrets.M2M_CLIENT_SECRET,
  });

  // Search for all accounts registered to this email address.
  // `fields` limits the payload to only what we need (faster, smaller response).
  const { data: sameEmailUsers } = await mgmt.usersByEmail.getByEmail({
    email:  event.user.email,
    fields: 'user_id,email_verified,app_metadata,identities',
  });

  // Filter out the current user and any whose email is not yet verified.
  const candidates = sameEmailUsers.filter(
    u => u.user_id !== event.user.user_id && u.email_verified === true,
  );

  // No duplicates — nothing to do.
  if (candidates.length === 0) return;

  // Choose the primary account: prefer the one with the most order history
  // (to preserve order data), then prefer auth0| (email+password) over social
  // connections so the canonical identity is always a stable DB account.
  const primary = candidates.sort((a, b) => {
    const aOrders = Array.isArray(a.app_metadata?.orders) ? a.app_metadata.orders.length : 0;
    const bOrders = Array.isArray(b.app_metadata?.orders) ? b.app_metadata.orders.length : 0;

    if (bOrders !== aOrders) return bOrders - aOrders; // more orders wins

    // Same order count — prefer database (auth0|) connection as primary
    const aIsDb = a.user_id.startsWith('auth0|') ? 1 : 0;
    const bIsDb = b.user_id.startsWith('auth0|') ? 1 : 0;
    return bIsDb - aIsDb;
  })[0];

  const secondaryUserId = event.user.user_id; // the user who just logged in
  const primaryUserId   = primary.user_id;    // the account they will merge into

  // Decompose the secondary user_id (format: "provider|providerUserId").
  // For example: "google-oauth2|1234567890" → provider="google-oauth2", id="1234567890"
  //              "auth0|abc123"             → provider="auth0", id="abc123"
  const pipeIdx        = secondaryUserId.indexOf('|');
  const provider       = secondaryUserId.substring(0, pipeIdx);
  const providerUserId = secondaryUserId.substring(pipeIdx + 1);

  // Link the secondary identity into the primary account.
  // After this call, logging in with either method resolves to primaryUserId.
  await mgmt.users.link(
    { id: primaryUserId },
    { provider, user_id: providerUserId },
  );

  // Tell Auth0 to continue this session under the primary user's identity.
  // The post-login-enrichment Action (running after this one) will therefore
  // inject the primary user's metadata, roles, and order history into the tokens.
  api.authentication.setPrimaryUser(primaryUserId);
};
