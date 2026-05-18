/**
 * Unit tests for HomeComponent
 *
 * Uses TestBed.runInInjectionContext(()=>new HomeComponent()) instead of
 * TestBed.createComponent(). This bypasses Angular's JIT templateUrl resolution
 * (which fails in the Vitest/jsdom environment) while still testing all class
 * logic through the real DI injector.
 *
 * POC Requirements covered:
 *   Req 7  — onOrderNow() is the single email-verification gate
 *   Req 10 — orders$ reads from idTokenClaims$ with zero HTTP calls
 */
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { HttpClient } from '@angular/common/http';
import { of, throwError, Subject } from 'rxjs';
import { firstValueFrom } from 'rxjs';

import { HomeComponent } from './home.component';
import { OrderService } from '../../core/services/order.service';
import type { Order } from '../../core/services/order.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeOrder = (id: string): Order => ({
  id,
  pizza: 'custom',
  crust: 'classic',
  size: 'medium',
  toppings: ['cheese'],
  timestamp: new Date().toISOString(),
});

const buildAuthMock = (overrides: {
  emailVerified?: boolean;
  idTokenOrders?: Order[];
} = {}) => ({
  isLoading$: of(false),
  isAuthenticated$: of(true),
  user$: of({
    email_verified: overrides.emailVerified ?? true,
    email: 'test@pizza42.com',
    name: 'Test',
    picture: '',
  }),
  idTokenClaims$: of({ 'https://pizza42.com/orders': overrides.idTokenOrders ?? [] }),
  loginWithRedirect: vi.fn(),
  logout: vi.fn(),
});

const buildOrderServiceMock = (result: boolean | Error) => ({
  checkEmailVerifiedThenProceed: vi.fn().mockReturnValue(
    result instanceof Error ? throwError(() => result) : of(result),
  ),
  placeOrder: vi.fn(),
});

/** Creates HomeComponent via injection context — skips templateUrl compilation */
const setup = (
  authOverrides: Parameters<typeof buildAuthMock>[0] = {},
  verificationResult: boolean | Error = true,
) => {
  const authMock = buildAuthMock(authOverrides);
  const orderServiceMock = buildOrderServiceMock(verificationResult);
  const httpMock = { get: vi.fn(), post: vi.fn() };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: authMock },
      { provide: OrderService, useValue: orderServiceMock },
      { provide: HttpClient, useValue: httpMock },
    ],
  });

  const component = TestBed.runInInjectionContext(() => new HomeComponent());
  const router = TestBed.inject(Router);
  return { component, router, authMock, orderServiceMock, httpMock };
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('HomeComponent', () => {

  // ── Req 10: orders$ from ID token, no HTTP ──────────────────────────────────

  describe('orders$ — Req 10: order history embedded in ID token', () => {
    it('emits orders from idTokenClaims$ with no HttpClient.get call', async () => {
      const expectedOrders = [makeOrder('a'), makeOrder('b')];
      const { component, httpMock } = setup({ idTokenOrders: expectedOrders });

      const orders = await firstValueFrom(component.orders$);

      expect(orders).toEqual(expectedOrders);
      expect(orders).toHaveLength(2);
      // Critical: no HTTP call was made — order history comes purely from the token
      expect(httpMock.get).not.toHaveBeenCalled();
    });

    it('emits an empty array when the claims object has no orders property', async () => {
      const authMock = { ...buildAuthMock(), idTokenClaims$: of({}) };
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: authMock },
          { provide: OrderService, useValue: buildOrderServiceMock(true) },
          { provide: HttpClient, useValue: { get: vi.fn() } },
        ],
      });
      const component = TestBed.runInInjectionContext(() => new HomeComponent());

      const orders = await firstValueFrom(component.orders$);
      expect(orders).toEqual([]);
    });

    it('emits an empty array when idTokenClaims$ emits null', async () => {
      const authMock = { ...buildAuthMock(), idTokenClaims$: of(null) };
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: authMock },
          { provide: OrderService, useValue: buildOrderServiceMock(true) },
          { provide: HttpClient, useValue: { get: vi.fn() } },
        ],
      });
      const component = TestBed.runInInjectionContext(() => new HomeComponent());

      const orders = await firstValueFrom(component.orders$);
      expect(orders).toEqual([]);
    });
  });

  // ── Req 7: onOrderNow() — email verification gate ──────────────────────────

  describe('onOrderNow() — Req 7: email verification gate', () => {
    it('navigates to /order when email is verified (positive path)', async () => {
      const { component, router } = setup({}, true);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.onOrderNow();
      await new Promise(r => setTimeout(r, 0));

      expect(navigateSpy).toHaveBeenCalledWith(['/order']);
      expect(component.showEmailModal()).toBe(false);
    });

    it('shows email modal when email is NOT verified — does NOT navigate', async () => {
      const { component, router } = setup({}, false);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.onOrderNow();
      await new Promise(r => setTimeout(r, 0));

      expect(component.showEmailModal()).toBe(true);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('calls loginWithRedirect() when silent token refresh throws (expired session)', async () => {
      const { component, authMock } = setup({}, new Error('login_required'));

      component.onOrderNow();
      await new Promise(r => setTimeout(r, 0));

      expect(authMock.loginWithRedirect).toHaveBeenCalledTimes(1);
      expect(component.showEmailModal()).toBe(false);
    });

    it('sets isCheckingEmail true during check, false after completion', async () => {
      const subject = new Subject<boolean>();
      const orderServiceMock = {
        checkEmailVerifiedThenProceed: vi.fn().mockReturnValue(subject.asObservable()),
      };
      const authMock = buildAuthMock();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: authMock },
          { provide: OrderService, useValue: orderServiceMock },
          { provide: HttpClient, useValue: { get: vi.fn() } },
        ],
      });
      const component = TestBed.runInInjectionContext(() => new HomeComponent());
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      expect(component.isCheckingEmail()).toBe(false);
      component.onOrderNow();
      expect(component.isCheckingEmail()).toBe(true);

      subject.next(true);
      subject.complete();
      await new Promise(r => setTimeout(r, 0));

      expect(component.isCheckingEmail()).toBe(false);
    });

    it('is a no-op on repeated clicks while checking (prevents double-submit)', async () => {
      const subject = new Subject<boolean>();
      const orderServiceMock = {
        checkEmailVerifiedThenProceed: vi.fn().mockReturnValue(subject.asObservable()),
      };
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: buildAuthMock() },
          { provide: OrderService, useValue: orderServiceMock },
          { provide: HttpClient, useValue: { get: vi.fn() } },
        ],
      });
      const component = TestBed.runInInjectionContext(() => new HomeComponent());

      component.onOrderNow();
      component.onOrderNow(); // second click — ignored
      component.onOrderNow(); // third click — ignored

      expect(orderServiceMock.checkEmailVerifiedThenProceed).toHaveBeenCalledTimes(1);
    });
  });

  // ── getDisplayOrders() ─────────────────────────────────────────────────────

  describe('getDisplayOrders()', () => {
    it('returns newest-first slice of 5 when showAllOrders is false', () => {
      const { component } = setup();
      const orders = Array.from({ length: 8 }, (_, i) => makeOrder(`order-${i}`));
      component.showAllOrders.set(false);

      const result = component.getDisplayOrders(orders);

      expect(result).toHaveLength(5);
      expect(result[0].id).toBe('order-7'); // last in = newest = first displayed
      expect(result[4].id).toBe('order-3');
    });

    it('returns all orders when showAllOrders is true', () => {
      const { component } = setup();
      const orders = Array.from({ length: 8 }, (_, i) => makeOrder(`order-${i}`));
      component.showAllOrders.set(true);

      const result = component.getDisplayOrders(orders);
      expect(result).toHaveLength(8);
      expect(result[0].id).toBe('order-7');
    });

    it('returns all orders when count ≤ 5 regardless of showAllOrders flag', () => {
      const { component } = setup();
      const orders = [makeOrder('a'), makeOrder('b'), makeOrder('c')];
      component.showAllOrders.set(false);

      expect(component.getDisplayOrders(orders)).toHaveLength(3);
    });

    it('does not mutate the original orders array (creates a reversed copy)', () => {
      const { component } = setup();
      const orders = [makeOrder('a'), makeOrder('b')];
      const originalIds = orders.map(o => o.id);
      component.getDisplayOrders(orders);
      expect(orders.map(o => o.id)).toEqual(originalIds);
    });
  });

  // ── onModalDismissed() ─────────────────────────────────────────────────────

  describe('onModalDismissed()', () => {
    it('sets showEmailModal to false', () => {
      const { component } = setup();
      component.showEmailModal.set(true);
      component.onModalDismissed();
      expect(component.showEmailModal()).toBe(false);
    });
  });
});
