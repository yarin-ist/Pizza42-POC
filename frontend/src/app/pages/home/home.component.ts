import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { map, filter, take } from 'rxjs/operators';
import { combineLatest } from 'rxjs';

import { OrderService } from '../../core/services/order.service';
import type { Order } from '../../core/services/order.service';
import { EmailVerificationModalComponent } from '../../shared/email-verification-modal/email-verification-modal.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, EmailVerificationModalComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);

  constructor() {
    // Auto-silent-auth: once the SDK finishes loading, if the user is not
    // authenticated and we are NOT processing a callback (no ?code= in URL),
    // attempt a transparent loginWithRedirect(). Auth0 checks its own server-side
    // httpOnly session cookie — if still active it redirects back in ~0.5s with
    // fresh tokens and no login form shown. A sessionStorage flag prevents
    // an infinite redirect loop when the Auth0 session has also expired.
    combineLatest([this.auth.isLoading$, this.auth.isAuthenticated$]).pipe(
      filter(([loading]) => !loading),
      take(1),
    ).subscribe(([, authenticated]) => {
      if (authenticated) {
        sessionStorage.removeItem('_auth_redir');
        return;
      }
      if (window.location.search.includes('code=')) return; // callback in progress
      if (sessionStorage.getItem('_auth_redir')) return;    // already tried once
      sessionStorage.setItem('_auth_redir', '1');
      this.auth.loginWithRedirect();
    });
  }

  /** Show email verification modal */
  showEmailModal = signal(false);

  /** Show all orders vs. first 5 */
  showAllOrders = signal(false);

  /** Is the email check in progress (shows spinner on button) */
  isCheckingEmail = signal(false);

  /**
   * Order history read DIRECTLY from the ID token via idTokenClaims$.
   * No network call — satisfies POC Requirement #10.
   * The Post-Login Action injects https://pizza42.com/orders into the ID token.
   */
  readonly orders$ = this.auth.idTokenClaims$.pipe(
    map(claims => {
      const orders = (claims?.['https://pizza42.com/orders'] as Order[] | undefined) ?? [];
      console.log(`[Home] Loaded ${orders.length} order(s) from ID token`);
      return orders;
    }),
  );

  /** User email for the modal display */
  readonly userEmail$ = this.auth.user$.pipe(
    map(user => user?.email ?? ''),
  );

  /**
   * Display name derived from ID token custom claims (progressive profile data)
   * with fallbacks: custom first_name → OIDC given_name → OIDC name → email.
   * For database users, Auth0's standard `name` claim defaults to the email
   * address, so we prioritise the value the user entered in Form A.
   */
  readonly displayName$ = combineLatest([
    this.auth.user$,
    this.auth.idTokenClaims$,
  ]).pipe(
    map(([user, claims]) => {
      const firstName = claims?.['https://pizza42.com/first_name'] as string | undefined;
      if (firstName) return firstName;
      return user?.given_name ?? user?.name ?? user?.email ?? '';
    }),
  );

  /**
   * "Order Now" click handler — THE SINGLE gate for email verification.
   * 1. Forces a silent token refresh (getAccessTokenSilently cacheMode: off)
   * 2. Reads fresh email_verified from the updated user claim
   * 3. Navigates to /order if verified, shows modal if not
   */
  onOrderNow(): void {
    if (this.isCheckingEmail()) return;

    this.isCheckingEmail.set(true);
    console.log('[Home] Order Now clicked — initiating silent email verification check');

    this.orderService.checkEmailVerifiedThenProceed().subscribe({
      next: (verified) => {
        this.isCheckingEmail.set(false);
        if (verified) {
          console.log('[Home] Email verified — navigating to /order');
          this.router.navigate(['/order']);
        } else {
          console.warn('[Home] Email not verified — showing verification modal');
          this.showEmailModal.set(true);
        }
      },
      error: (err) => {
        // If silent refresh fails (e.g. no active session), redirect to login
        console.error('[Home] Silent token refresh failed', err);
        this.isCheckingEmail.set(false);
        this.auth.loginWithRedirect();
      },
    });
  }

  onModalDismissed(): void {
    this.showEmailModal.set(false);
  }

  /** Returns the last 5 orders or all of them based on showAllOrders */
  getDisplayOrders(orders: Order[]): Order[] {
    const reversed = [...orders].reverse(); // newest first
    return this.showAllOrders() ? reversed : reversed.slice(0, 5);
  }

  /** Formats a timestamp for display */
  formatDate(timestamp: string): string {
    try {
      return new Date(timestamp).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
  }
}
