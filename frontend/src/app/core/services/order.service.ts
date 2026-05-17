import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, throwError } from 'rxjs';
import { catchError, map, switchMap, take } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

export interface Order {
  id: string;
  pizza: string;
  crust: string;
  size: string;
  toppings: string[];
  timestamp: string;
}

export interface CreateOrderDto {
  pizza: string;
  crust: string;
  size: string;
  toppings: string[];
}

export interface EmailUnverifiedError {
  type: 'EMAIL_UNVERIFIED';
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /**
   * Silently refreshes the access token (bypassing cache) and reads the
   * standard `email_verified` claim from the freshly issued ID token.
   *
   * Called from ONE place only: the "Order Now" button handler in HomeComponent.
   * This is the single gate before the user reaches the pizza builder.
   *
   * Returns true if email is verified, false if not.
   * The caller handles navigation vs. modal display.
   */
  checkEmailVerifiedThenProceed(): Observable<boolean> {
    console.log('[OrderService] checkEmailVerifiedThenProceed: forcing silent token refresh');
    return this.auth.getAccessTokenSilently({ cacheMode: 'off' }).pipe(
      switchMap(() => this.auth.user$),
      map(user => {
        const verified = !!user?.email_verified;
        console.log(`[OrderService] email_verified after silent refresh: ${verified}`);
        return verified;
      }),
      take(1),
    );
  }

  /**
   * POSTs a new order to the NestJS backend.
   * The authHttpInterceptorFn (configured in app.config.ts) automatically
   * attaches the Bearer access token — no manual token handling here.
   *
   * Error handling:
   *   HTTP 403 → signals EMAIL_UNVERIFIED to the caller (edge case safety net).
   *              No silent refresh is attempted here — the pre-navigation check
   *              in HomeComponent is the primary verification gate.
   *   Other errors → re-thrown for generic error handling in the component.
   */
  placeOrder(dto: CreateOrderDto): Observable<Order> {
    console.log('[OrderService] placeOrder: submitting order', dto);
    return this.http.post<Order>(`${environment.apiUrl}/orders`, dto).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 403) {
          // 403 means the backend rejected the token due to email_verified: false.
          // This is the edge case safety net (e.g. stale token from a separate tab).
          // Signal the component to show the verification modal — no retry here.
          console.warn('[OrderService] placeOrder: received 403 — email not verified (edge case)');
          const unverifiedError: EmailUnverifiedError = { type: 'EMAIL_UNVERIFIED' };
          return throwError(() => unverifiedError);
        }
        console.error('[OrderService] placeOrder: unexpected error', err);
        return throwError(() => err);
      }),
    );
  }
}
