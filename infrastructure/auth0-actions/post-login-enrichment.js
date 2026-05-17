const { ManagementClient } = require('auth0');

/**
 * Auth0 Post-Login Action — Pizza 42 Token Enrichment
 *
 * Responsibilities (in execution order):
 *   0. Progressive profiling — renders the appropriate form once per login
 *      if the user is still missing profile data. Exits immediately after
 *      api.prompt.render(); the Action is re-called after the form completes.
 *   1. First-login customer role assignment + permissions gap bridge
 *   2. Email-verified claim → Access Token (every login)
 *   3. Order history → ID Token (every login, POC-only unbounded array)
 *   4. Progressive profile claims → ID Token (only when data exists)
 *   5. Roles claim → ID Token (every login)
 *
 * Secrets required (Actions > post-login-enrichment > Secrets):
 *   AUTH0_DOMAIN      — e.g. pizza42-poc-yarin.eu.auth0.com (no https://)
 *   M2M_CLIENT_ID     — Client ID of the NestJS Management Sync M2M app
 *   M2M_CLIENT_SECRET — Client Secret of the same M2M app
 *
 * Form IDs (progressive profiling):
 *   Form A — Basic Profile:               ap_doQ2vxByebenEzMdW8H54s
 *   Form B — Marketing Consent & DOB:     ap_x4CPm9DwSWWH1ax6fXeUa5
 *   Form C — Favourite Crust Preference:  ap_dmgT6H89jFDbxFSw372EBJ
 *
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onExecutePostLogin = async (event, api) => {

  // =========================================================================
  // BLOCK 0 — Progressive Profiling Forms
  // =========================================================================
  // On the first pass of each login (event.prompt.id is absent), we check
  // whether any profile form is still due and render the first one found.
  // Returning immediately ensures only ONE form is shown per login session.
  //
  // When the user completes or skips a form, Auth0 re-invokes this Action
  // with event.prompt.id set to the form that just finished. In that "resume"
  // state we skip this block and fall through to token injection, which now
  // has access to the freshly updated user_metadata.
  //
  // SKIP BEHAVIOUR: if the user clicks Skip and the Form's Flow node does not
  // write a value to user_metadata, the condition below will still be true on
  // the next login and the form will appear again. To prevent re-showing after
  // a skip, configure each Form's skip path to write a sentinel value:
  //   Form B skip → user_metadata.marketing_consent = false
  //   Form C skip → user_metadata.favorite_crust = 'skipped'
  if (!event.prompt?.id) {
    const meta = event.user.user_metadata || {};
    const logins = event.stats.logins_count;

    // Form A — Basic Profile (first name / last name)
    // Shown on login 1+. Re-shown each login until both fields are filled.
    if (logins >= 1 && (!meta.first_name || !meta.last_name)) {
      return api.prompt.render('ap_doQ2vxByebenEzMdW8H54s');
    }

    // Form B — Marketing Consent & Date of Birth
    // Shown on login 2+. Re-shown until any value (true or false) is stored.
    if (logins >= 2 && meta.marketing_consent === undefined) {
      return api.prompt.render('ap_x4CPm9DwSWWH1ax6fXeUa5');
    }

    // Form C — Favourite Crust Preference
    // Shown on login 3+. Re-shown until a preference string is stored.
    if (logins >= 3 && !meta.favorite_crust) {
      return api.prompt.render('ap_dmgT6H89jFDbxFSw372EBJ');
    }
  }

  // =========================================================================
  // BLOCK 1 — First-Login Role Assignment
  // =========================================================================
  // logins_count stays at 1 for the entire first login session, including on
  // the resume pass after Form A. Role assignment and the permissions bridge
  // therefore fire correctly whether or not a form was shown first.
  if (event.stats.logins_count === 1) {
    const mgmt = new ManagementClient({
      domain: event.secrets.AUTH0_DOMAIN,
      clientId: event.secrets.M2M_CLIENT_ID,
      clientSecret: event.secrets.M2M_CLIENT_SECRET,
    });

    // Fetch all roles and find "Customer" by name rather than by hardcoded ID.
    // This keeps the Action portable across tenant export/import.
    const { data: roles } = await mgmt.roles.getAll();
    const customerRole = roles.find((r) => r.name === 'Customer');

    if (customerRole) {
      await mgmt.users.assignRoles(
        { id: event.user.user_id },
        { roles: [customerRole.id] }
      );
    }

    // Permissions gap bridge: RBAC ran before this Action and captured zero
    // roles (the assignment above takes effect on the next login). Manually
    // inject create:orders for this session only so the user can place orders
    // immediately. From login 2 onward, RBAC supplies the permission.
    api.accessToken.setCustomClaim('permissions', ['create:orders']);
  }

  // =========================================================================
  // BLOCK 2 — Email Verified Claim (every login)
  // =========================================================================
  // Injected into the Access Token under a namespaced URI per OIDC spec.
  // The NestJS backend reads this claim to enforce the email-verification
  // business rule — absent or false → HTTP 403 on POST /orders.
  api.accessToken.setCustomClaim(
    'https://pizza42.com/email_verified',
    event.user.email_verified
  );

  // =========================================================================
  // BLOCK 3 — Order History in ID Token (every login)
  // =========================================================================
  // POC ONLY — unbounded array satisfying Requirement #10.
  // Phase 5 will cap this at the 5 most recent orders and add a paginated
  // GET /orders endpoint for full history retrieval via Access Token.
  const orders = event.user.app_metadata?.orders || [];
  api.idToken.setCustomClaim('https://pizza42.com/orders', orders);

  // =========================================================================
  // BLOCK 4 — Progressive Profile Claims (every login, only if data exists)
  // =========================================================================
  // Claims are injected only when the corresponding user_metadata field is
  // populated. The Angular profile page uses @if on each namespaced claim —
  // absent claims keep the field hidden until the user fills the form.
  const meta = event.user.user_metadata || {};
  if (meta.first_name)
    api.idToken.setCustomClaim('https://pizza42.com/first_name',         meta.first_name);
  if (meta.last_name)
    api.idToken.setCustomClaim('https://pizza42.com/last_name',          meta.last_name);
  if (meta.phone)
    api.idToken.setCustomClaim('https://pizza42.com/phone',              meta.phone);
  if (meta.date_of_birth)
    api.idToken.setCustomClaim('https://pizza42.com/date_of_birth',      meta.date_of_birth);
  if (meta.marketing_consent !== undefined)
    api.idToken.setCustomClaim('https://pizza42.com/marketing_consent',  meta.marketing_consent);
  if (meta.favorite_crust)
    api.idToken.setCustomClaim('https://pizza42.com/favorite_crust',     meta.favorite_crust);

  // =========================================================================
  // BLOCK 5 — Roles Claim (every login)
  // =========================================================================
  // Injects RBAC role names into the ID Token so the Angular profile page can
  // display a "Customer" badge without a Management API call.
  // On login 1 this may be [] (role was just assigned above and RBAC has not
  // yet re-evaluated); from login 2 onward it contains ["Customer"].
  api.idToken.setCustomClaim(
    'https://pizza42.com/roles',
    event.authorization?.roles ?? []
  );
};
