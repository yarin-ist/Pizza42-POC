/**
 * Unit tests for OrderComponent (pizza builder)
 *
 * Uses TestBed.runInInjectionContext() to bypass templateUrl compilation
 * and test pure TypeScript class logic.
 *
 * POC Requirements covered:
 *   Req 5  — placeOrder() sends correct DTO to backend
 *   Req 7  — EMAIL_UNVERIFIED edge-case triggers modal (safety net)
 */
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { OrderComponent } from './order.component';
import { OrderService } from '../../core/services/order.service';
import type { Order, EmailUnverifiedError } from '../../core/services/order.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockOrder: Order = {
  id: 'order-abc',
  pizza: 'custom',
  crust: 'classic',
  size: 'medium',
  toppings: ['cheese'],
  timestamp: '2026-05-17T12:00:00.000Z',
};

const buildAuthMock = () => ({
  user$: of({ email: 'test@pizza42.com', email_verified: true }),
});

const setup = () => {
  const orderServiceMock = { placeOrder: vi.fn(), checkEmailVerifiedThenProceed: vi.fn() };
  const authMock = buildAuthMock();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: authMock },
      { provide: OrderService, useValue: orderServiceMock },
    ],
  });

  const component = TestBed.runInInjectionContext(() => new OrderComponent());
  const router = TestBed.inject(Router);
  return { component, router, orderServiceMock };
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('OrderComponent', () => {

  describe('initial state', () => {
    it('defaults to medium size', () => {
      const { component } = setup();
      expect(component.selectedSize()).toBe('medium');
    });

    it('defaults to classic crust', () => {
      const { component } = setup();
      expect(component.selectedCrust()).toBe('classic');
    });

    it('starts with no toppings selected', () => {
      const { component } = setup();
      expect(component.selectedToppingIds().size).toBe(0);
      expect(component.selectedToppings).toHaveLength(0);
    });

    it('starts with idle order state', () => {
      const { component } = setup();
      expect(component.orderState()).toBe('idle');
    });

    it('exposes 3 size options: small, medium, large', () => {
      const { component } = setup();
      const ids = component.sizes.map(s => s.id);
      expect(ids).toEqual(['small', 'medium', 'large']);
    });

    it('exposes 3 crust options: thin, classic, thick', () => {
      const { component } = setup();
      const ids = component.crusts.map(c => c.id);
      expect(ids).toEqual(['thin', 'classic', 'thick']);
    });
  });

  // ── toggleTopping() ─────────────────────────────────────────────────────────

  describe('toggleTopping()', () => {
    it('adds a topping when not selected', () => {
      const { component } = setup();
      component.toggleTopping('cheese');
      expect(component.isToppingSelected('cheese')).toBe(true);
    });

    it('removes a topping when already selected', () => {
      const { component } = setup();
      component.toggleTopping('cheese');
      component.toggleTopping('cheese');
      expect(component.isToppingSelected('cheese')).toBe(false);
    });

    it('manages multiple toppings independently', () => {
      const { component } = setup();
      component.toggleTopping('cheese');
      component.toggleTopping('olives');
      component.toggleTopping('bacon');
      component.toggleTopping('cheese'); // remove cheese

      expect(component.isToppingSelected('cheese')).toBe(false);
      expect(component.isToppingSelected('olives')).toBe(true);
      expect(component.isToppingSelected('bacon')).toBe(true);
    });

    it('updates selectedToppings getter reactively', () => {
      const { component } = setup();
      expect(component.selectedToppings).toHaveLength(0);

      component.toggleTopping('tomato');
      component.toggleTopping('mushroom');
      expect(component.selectedToppings).toHaveLength(2);

      component.toggleTopping('tomato');
      expect(component.selectedToppings).toHaveLength(1);
    });
  });

  // ── placeOrder() ────────────────────────────────────────────────────────────

  describe('placeOrder()', () => {
    it('sets orderState to success and populates toastMessage on 201 (Req 5)', async () => {
      const { component, router, orderServiceMock } = setup();
      orderServiceMock.placeOrder.mockReturnValue(of(mockOrder));
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.placeOrder();
      await new Promise(r => setTimeout(r, 0));

      expect(component.orderState()).toBe('success');
      expect(component.toastMessage()).toContain('Order placed');
    });

    it('navigates to / after 2500ms on success', async () => {
      vi.useFakeTimers();
      const { component, router, orderServiceMock } = setup();
      orderServiceMock.placeOrder.mockReturnValue(of(mockOrder));
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.placeOrder();
      await Promise.resolve();
      vi.advanceTimersByTime(2500);

      expect(navigateSpy).toHaveBeenCalledWith(['/']);
      vi.useRealTimers();
    });

    it('shows email modal and resets to idle on EMAIL_UNVERIFIED (Req 7 edge-case)', async () => {
      const { component, orderServiceMock } = setup();
      const err: EmailUnverifiedError = { type: 'EMAIL_UNVERIFIED' };
      orderServiceMock.placeOrder.mockReturnValue(throwError(() => err));

      component.placeOrder();
      await new Promise(r => setTimeout(r, 0));

      expect(component.showEmailModal()).toBe(true);
      expect(component.orderState()).toBe('idle');
      expect(component.errorMessage()).toBe('');
    });

    it('sets orderState to error and populates errorMessage on HTTP 500', async () => {
      const { component, orderServiceMock } = setup();
      orderServiceMock.placeOrder.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
      );

      component.placeOrder();
      await new Promise(r => setTimeout(r, 0));

      expect(component.orderState()).toBe('error');
      expect(component.errorMessage()).toContain('500');
      expect(component.showEmailModal()).toBe(false);
    });

    it('sets "cannot reach server" message on network error (status 0)', async () => {
      const { component, orderServiceMock } = setup();
      orderServiceMock.placeOrder.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' })),
      );

      component.placeOrder();
      await new Promise(r => setTimeout(r, 0));

      expect(component.errorMessage().toLowerCase()).toContain('connection');
    });

    it('is a no-op when already submitting (prevents duplicate requests)', () => {
      const { component, orderServiceMock } = setup();
      component.orderState.set('submitting');

      component.placeOrder();

      expect(orderServiceMock.placeOrder).not.toHaveBeenCalled();
    });

    it('sends the correct DTO — pizza: "custom", plus current size/crust/toppings', async () => {
      const { component, router, orderServiceMock } = setup();
      orderServiceMock.placeOrder.mockReturnValue(of(mockOrder));
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.selectedSize.set('large');
      component.selectedCrust.set('thin');
      component.toggleTopping('cheese');
      component.toggleTopping('olives');
      component.placeOrder();

      expect(orderServiceMock.placeOrder).toHaveBeenCalledWith({
        pizza: 'custom',
        crust: 'thin',
        size: 'large',
        toppings: expect.arrayContaining(['cheese', 'olives']),
      });
    });
  });

  // ── onModalDismissed() / goHome() ───────────────────────────────────────────

  describe('onModalDismissed()', () => {
    it('sets showEmailModal to false', () => {
      const { component } = setup();
      component.showEmailModal.set(true);
      component.onModalDismissed();
      expect(component.showEmailModal()).toBe(false);
    });
  });

  describe('goHome()', () => {
    it('navigates to /', () => {
      const { component, router } = setup();
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.goHome();
      expect(spy).toHaveBeenCalledWith(['/']);
    });
  });
});
