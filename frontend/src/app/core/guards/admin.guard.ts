import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { combineLatest, map, filter, take } from 'rxjs';

/**
 * Route guard that allows access only to users with the "Admin" role.
 *
 * The Admin role is injected into the ID token by the post-login Action
 * as the namespaced claim `https://pizza42.com/roles`.
 *
 * Non-admin authenticated users are redirected to the home page.
 * Unauthenticated users are redirected to the home page (AuthGuard should
 * be composed before this guard for cleaner redirect-to-login behaviour,
 * but home will handle the unauthenticated state gracefully).
 */
export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  return combineLatest([auth.isLoading$, auth.idTokenClaims$]).pipe(
    filter(([loading]) => !loading),
    take(1),
    map(([, claims]) => {
      const roles = claims?.['https://pizza42.com/roles'] as string[] | undefined;
      if (roles?.includes('Admin')) return true;

      // Authenticated but not an admin — redirect silently to home
      router.navigate(['/']);
      return false;
    }),
  );
};
