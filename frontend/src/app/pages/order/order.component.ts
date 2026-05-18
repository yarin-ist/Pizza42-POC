import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { HttpErrorResponse } from '@angular/common/http';
import { take } from 'rxjs/operators';

import { OrderService } from '../../core/services/order.service';
import type { EmailUnverifiedError } from '../../core/services/order.service';
import { EmailVerificationModalComponent } from '../../shared/email-verification-modal/email-verification-modal.component';

export interface Topping {
  id: string;
  label: string;
  emoji: string;
  position: { top: number; left: number };
}

const ALL_TOPPINGS: Topping[] = [
  { id: 'tomato',    label: 'Tomatoes',    emoji: '🍅', position: { top: 28, left: 38 } },
  { id: 'cheese',    label: 'Extra Cheese', emoji: '🧀', position: { top: 48, left: 22 } },
  { id: 'peppers',   label: 'Hot Peppers', emoji: '🌶️', position: { top: 58, left: 58 } },
  { id: 'mushroom',  label: 'Mushrooms',   emoji: '🍄', position: { top: 25, left: 60 } },
  { id: 'olives',    label: 'Olives',      emoji: '🫒', position: { top: 65, left: 35 } },
  { id: 'onions',    label: 'Onions',      emoji: '🧅', position: { top: 42, left: 65 } },
  { id: 'bacon',     label: 'Bacon',       emoji: '🥓', position: { top: 35, left: 50 } },
  { id: 'pepperoni', label: 'Pepperoni',   emoji: '🍕', position: { top: 55, left: 28 } },
];

type OrderState = 'idle' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'app-order',
  standalone: true,
  imports: [CommonModule, EmailVerificationModalComponent],
  templateUrl: './order.component.html',
})
export class OrderComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly orderService = inject(OrderService);

  constructor() {
    // Email verification guard — blocks direct URL navigation to /order for
    // users whose email is not yet verified. The same check exists on the
    // "Order Now" button in HomeComponent, but a URL-savvy user could bypass
    // that by typing /order directly. This is the defence-in-depth layer.
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user && !user.email_verified) {
        console.warn('[Order] Email not verified — redirecting home');
        this.router.navigate(['/']);
      }
    });
  }

  // ----- Pizza builder state -----
  selectedSize = signal<string>('medium');
  selectedCrust = signal<string>('classic');
  selectedToppingIds = signal<Set<string>>(new Set());

  // ----- UI state -----
  orderState = signal<OrderState>('idle');
  errorMessage = signal<string>('');
  showEmailModal = signal(false);
  toastMessage = signal<string>('');

  // ----- Static data exposed to template -----
  readonly sizes = [
    { id: 'small',  label: 'Small',  description: '8"  — 4 slices' },
    { id: 'medium', label: 'Medium', description: '12" — 6 slices' },
    { id: 'large',  label: 'Large',  description: '16" — 8 slices' },
  ];

  readonly crusts = [
    { id: 'thin',    label: 'Thin',    description: 'Crispy & light' },
    { id: 'classic', label: 'Classic', description: 'The original' },
    { id: 'thick',   label: 'Thick',   description: 'Deep & doughy' },
  ];

  readonly allToppings = ALL_TOPPINGS;

  /** User email for the modal */
  readonly userEmail$ = this.auth.user$.pipe();

  // ----- Derived state -----
  get selectedToppings(): Topping[] {
    return ALL_TOPPINGS.filter(t => this.selectedToppingIds().has(t.id));
  }

  toggleTopping(id: string): void {
    const current = new Set(this.selectedToppingIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.selectedToppingIds.set(current);
  }

  isToppingSelected(id: string): boolean {
    return this.selectedToppingIds().has(id);
  }

  /**
   * Submits the order to the NestJS backend.
   * Edge case: if the backend returns 403, the OrderService will surface
   * an EMAIL_UNVERIFIED error and we show the modal as a safety net.
   * The primary email check was already done before the user reached this page.
   */
  placeOrder(): void {
    if (this.orderState() === 'submitting') return;

    const dto = {
      pizza: 'custom',
      crust: this.selectedCrust(),
      size: this.selectedSize(),
      toppings: Array.from(this.selectedToppingIds()),
    };

    console.log('[Order] Submitting order', dto);
    this.orderState.set('submitting');
    this.errorMessage.set('');

    this.orderService.placeOrder(dto).subscribe({
      next: (order) => {
        console.log('[Order] Order placed successfully', order);
        this.orderState.set('success');
        this.toastMessage.set('🍕 Order placed! Your pizza is on its way.');
        // Force a silent token refresh so Auth0 re-runs the Post-Login Action,
        // which reads the newly saved app_metadata.orders and embeds them in a
        // fresh ID token. When we navigate home, idTokenClaims$ immediately
        // reflects the new order — no re-login required.
        this.auth.getAccessTokenSilently({ cacheMode: 'off' }).pipe(take(1)).subscribe({
          next: () => setTimeout(() => this.router.navigate(['/']), 1500),
          error: () => setTimeout(() => this.router.navigate(['/']), 1500),
        });
      },
      error: (err: EmailUnverifiedError | HttpErrorResponse) => {
        if ((err as EmailUnverifiedError).type === 'EMAIL_UNVERIFIED') {
          // Edge case: token was valid when we entered but email still not verified
          // in the backend's custom claim (e.g. stale token from another tab).
          console.warn('[Order] Backend rejected order: email_verified is false (edge case)');
          this.orderState.set('idle');
          this.showEmailModal.set(true);
        } else {
          const httpErr = err as HttpErrorResponse;
          console.error('[Order] Unexpected error placing order', httpErr);
          this.orderState.set('error');
          this.errorMessage.set(
            httpErr.status === 0
              ? 'Cannot reach the server. Please check your connection.'
              : `Something went wrong (${httpErr.status || 'Unknown error'}). Please try again.`,
          );
        }
      },
    });
  }

  onModalDismissed(): void {
    this.showEmailModal.set(false);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
