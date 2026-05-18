import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { combineLatest, map } from 'rxjs';

import type { Order } from '../../core/services/order.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './profile.component.html',
})
export class ProfileComponent {
  readonly auth = inject(AuthService);

  /**
   * Combines user$ and idTokenClaims$ into a single profile object.
   * All custom claims are sourced from the ID token — no Management API call.
   * Sections are null when the claim is absent so @if hides them automatically.
   */
  readonly profile$ = combineLatest([
    this.auth.user$,
    this.auth.idTokenClaims$,
  ]).pipe(
    map(([user, claims]) => {
      if (!user) return null;

      const firstName   = claims?.['https://pizza42.com/first_name']        as string | undefined;
      const lastName    = claims?.['https://pizza42.com/last_name']         as string | undefined;
      const phone       = claims?.['https://pizza42.com/phone']             as string | undefined;
      const dob         = claims?.['https://pizza42.com/date_of_birth']     as string | undefined;
      const consent     = claims?.['https://pizza42.com/marketing_consent'] as boolean | undefined;
      const crust       = claims?.['https://pizza42.com/favorite_crust']    as string | undefined;
      const roles       = claims?.['https://pizza42.com/roles']             as string[] | undefined;
      const orders      = claims?.['https://pizza42.com/orders']            as Order[] | undefined;

      // Display name: custom first_name → OIDC given_name → OIDC name → email
      const displayName = firstName ?? user.given_name ?? user.name ?? user.email ?? '';

      // Favorite crust — hide the section entirely if never answered or skipped
      const crustDisplay = (crust && crust !== 'skipped') ? crust : null;

      // Marketing section visible if at least one field has data
      const hasMarketing = dob !== undefined || consent !== undefined;

      // Personal details section visible only if first_name exists
      const hasPersonal = !!firstName;

      return {
        // OIDC base
        email:          user.email ?? '',
        emailVerified:  user.email_verified ?? false,
        picture:        user.picture ?? '',

        // Derived display
        displayName,

        // Personal details section
        hasPersonal,
        firstName,
        lastName,
        phone,

        // Marketing section
        hasMarketing,
        dob,
        consent,

        // Pizza preferences section
        crustDisplay,

        // Role & orders
        roles:       roles ?? [],
        orderCount:  orders?.length ?? 0,
      };
    }),
  );

  /** Format ISO date string as dd Mon yyyy */
  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }
}
