/**
 * Unit tests for OrderService
 *
 * POC Requirements covered:
 *   Req 7 — email verification enforced before ordering (placeOrder 403 case)
 *   Req 8 — API call requires valid token (HttpTestingController intercepts)
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthService } from '@auth0/auth0-angular';
import { of, throwError } from 'rxjs';
import { firstValueFrom } from 'rxjs';

import { OrderService } from './order.service';
import type { Order, EmailUnverifiedError } from './order.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const buildAuthMock = (emailVerified: boolean) => ({
  getAccessTokenSilently: vi.fn().mockReturnValue(of('fake-access-token')),
  user$: of({ email_verified: emailVerified, sub: 'auth0|test123' }),
});

describe('OrderService', () => {
  let service: OrderService;
  let httpTesting: HttpTestingController;
  let authMock: ReturnType<typeof buildAuthMock>;

  const setupService = (emailVerified = true) => {
    authMock = buildAuthMock(emailVerified);
    TestBed.configureTestingModule({
      providers: [
        OrderService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authMock },
      ],
    });
    service = TestBed.inject(OrderService);
    httpTesting = TestBed.inject(HttpTestingController);
  };

  afterEach(() => {
    httpTesting?.verify();
  });

  // ── checkEmailVerifiedThenProceed ──────────────────────────────────────────

  describe('checkEmailVerifiedThenProceed()', () => {
    it('emits true when email_verified is true (Req 7 positive)', async () => {
      setupService(true);
      const result = await firstValueFrom(service.checkEmailVerifiedThenProceed());
      expect(result).toBe(true);
      expect(authMock.getAccessTokenSilently).toHaveBeenCalledWith({ cacheMode: 'off' });
    });

    it('emits false when email_verified is false (Req 7 negative)', async () => {
      setupService(false);
      const result = await firstValueFrom(service.checkEmailVerifiedThenProceed());
      expect(result).toBe(false);
    });

    it('forces a cache bypass — calls getAccessTokenSilently with cacheMode:off', async () => {
      setupService(true);
      await firstValueFrom(service.checkEmailVerifiedThenProceed());
      expect(authMock.getAccessTokenSilently).toHaveBeenCalledTimes(1);
      expect(authMock.getAccessTokenSilently).toHaveBeenCalledWith({ cacheMode: 'off' });
    });

    it('propagates error when getAccessTokenSilently throws (session expired)', async () => {
      setupService(true);
      authMock.getAccessTokenSilently.mockReturnValue(throwError(() => new Error('login_required')));
      await expect(
        firstValueFrom(service.checkEmailVerifiedThenProceed()),
      ).rejects.toThrow('login_required');
    });

    it('emits false when user$ emits null (no active session)', async () => {
      authMock = {
        getAccessTokenSilently: vi.fn().mockReturnValue(of('token')),
        user$: of(null as any),
      };
      TestBed.configureTestingModule({
        providers: [
          OrderService,
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: AuthService, useValue: authMock },
        ],
      });
      service = TestBed.inject(OrderService);
      httpTesting = TestBed.inject(HttpTestingController);

      const result = await firstValueFrom(service.checkEmailVerifiedThenProceed());
      expect(result).toBe(false);
    });
  });

  // ── placeOrder ──────────────────────────────────────────────────────────────

  describe('placeOrder()', () => {
    const dto = { pizza: 'Margherita', crust: 'classic', size: 'medium', toppings: ['cheese'] };
    const mockOrder: Order = {
      id: 'order-1',
      pizza: 'Margherita',
      crust: 'classic',
      size: 'medium',
      toppings: ['cheese'],
      timestamp: '2026-05-17T10:00:00.000Z',
    };

    beforeEach(() => setupService());

    it('emits the created order on HTTP 201 success (Req 5 — call the API)', async () => {
      const resultPromise = firstValueFrom(service.placeOrder(dto));

      const req = httpTesting.expectOne('http://localhost:3000/orders');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(dto);
      req.flush(mockOrder, { status: 201, statusText: 'Created' });

      const order = await resultPromise;
      expect(order).toEqual(mockOrder);
    });

    it('sends the request to the correct URL', async () => {
      service.placeOrder(dto).subscribe();
      const req = httpTesting.expectOne(r => r.url.endsWith('/orders'));
      expect(req.request.url).toBe('http://localhost:3000/orders');
      req.flush(mockOrder);
    });

    it('throws EMAIL_UNVERIFIED (plain object, NOT HttpErrorResponse) on 403 (Req 7 edge-case)', async () => {
      const errorPromise = firstValueFrom(service.placeOrder(dto));

      httpTesting.expectOne('http://localhost:3000/orders').flush(
        { message: 'Email verification required' },
        { status: 403, statusText: 'Forbidden' },
      );

      const err: EmailUnverifiedError = await errorPromise.catch(e => e);
      expect(err).toEqual({ type: 'EMAIL_UNVERIFIED' });
      expect((err as any).status).toBeUndefined(); // NOT an HttpErrorResponse
    });

    it('re-throws the original HttpErrorResponse on HTTP 500', async () => {
      const errorPromise = firstValueFrom(service.placeOrder(dto));

      httpTesting.expectOne('http://localhost:3000/orders').flush(
        { message: 'Internal Server Error' },
        { status: 500, statusText: 'Server Error' },
      );

      const err = await errorPromise.catch(e => e);
      expect(err.status).toBe(500);
      expect((err as EmailUnverifiedError).type).toBeUndefined();
    });

    it('re-throws the original error on network failure (status 0)', async () => {
      const errorPromise = firstValueFrom(service.placeOrder(dto));

      const req = httpTesting.expectOne('http://localhost:3000/orders');
      req.error(new ProgressEvent('network'), { status: 0, statusText: 'Unknown Error' });

      const err = await errorPromise.catch(e => e);
      expect(err.status).toBe(0);
    });
  });
});
