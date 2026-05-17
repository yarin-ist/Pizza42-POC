/**
 * Unit tests for OrdersController
 *
 * Tests the createOrder endpoint in isolation by mocking OrdersService.
 * Guards (JwtAuthGuard, ScopesGuard) are NOT applied here — they have their
 * own separate unit tests. This suite focuses on the controller's own logic:
 * the email_verified custom claim check.
 *
 * POC Requirements covered:
 *   Req 7 — email verification enforced at the HTTP layer (ForbiddenException)
 *   Req 5 — delegates to OrdersService.createOrder when all checks pass
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import type { Order } from './orders.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockOrder: Order = {
  id: 'order-42',
  pizza: 'Margherita',
  size: 'large',
  timestamp: '2026-05-17T10:00:00.000Z',
};

/** Builds a mock Express Request with a JWT payload in req.user */
function buildRequest(userOverrides: Record<string, unknown> = {}) {
  return {
    user: {
      sub: 'auth0|user123',
      permissions: ['create:orders'],
      'https://pizza42.com/email_verified': true,
      ...userOverrides,
    },
  };
}

const buildOrderBody = () => ({ pizza: 'Margherita', size: 'large' });

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersService: jest.Mocked<OrdersService>;

  beforeEach(async () => {
    const mockOrdersService: Partial<jest.Mocked<OrdersService>> = {
      createOrder: jest.fn().mockResolvedValue(mockOrder),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockOrdersService },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    ordersService = module.get<jest.Mocked<OrdersService>>(OrdersService);
  });

  // ── Req 7 — email_verified gate ────────────────────────────────────────────

  describe('email verification enforcement (Req 7)', () => {
    it('throws ForbiddenException when email_verified custom claim is false', async () => {
      const req = buildRequest({ 'https://pizza42.com/email_verified': false });
      await expect(controller.createOrder(req as any, buildOrderBody()))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when email_verified custom claim is absent', async () => {
      const req = buildRequest({ 'https://pizza42.com/email_verified': undefined });
      await expect(controller.createOrder(req as any, buildOrderBody()))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when email_verified is null', async () => {
      const req = buildRequest({ 'https://pizza42.com/email_verified': null });
      await expect(controller.createOrder(req as any, buildOrderBody()))
        .rejects.toThrow(ForbiddenException);
    });

    it('does NOT throw when email_verified is true', async () => {
      const req = buildRequest({ 'https://pizza42.com/email_verified': true });
      await expect(controller.createOrder(req as any, buildOrderBody()))
        .resolves.toBeDefined();
    });

    it('ForbiddenException message mentions email verification', async () => {
      const req = buildRequest({ 'https://pizza42.com/email_verified': false });
      try {
        await controller.createOrder(req as any, buildOrderBody());
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).message.toLowerCase()).toContain('email');
      }
    });
  });

  // ── Req 5 — delegation to OrdersService ────────────────────────────────────

  describe('delegation to OrdersService (Req 5)', () => {
    it('calls ordersService.createOrder with user.sub and the request body', async () => {
      const req = buildRequest();
      const body = buildOrderBody();

      await controller.createOrder(req as any, body);

      expect(ordersService.createOrder).toHaveBeenCalledWith('auth0|user123', body);
      expect(ordersService.createOrder).toHaveBeenCalledTimes(1);
    });

    it('returns the order object from OrdersService', async () => {
      const req = buildRequest();
      const result = await controller.createOrder(req as any, buildOrderBody());
      expect(result).toEqual(mockOrder);
    });

    it('does NOT call OrdersService when email_verified is false (no side effects)', async () => {
      const req = buildRequest({ 'https://pizza42.com/email_verified': false });
      try {
        await controller.createOrder(req as any, buildOrderBody());
      } catch {
        // expected
      }
      expect(ordersService.createOrder).not.toHaveBeenCalled();
    });

    it('propagates exceptions thrown by OrdersService', async () => {
      const serviceError = new Error('Management API unavailable');
      ordersService.createOrder.mockRejectedValue(serviceError);

      const req = buildRequest();
      await expect(controller.createOrder(req as any, buildOrderBody()))
        .rejects.toThrow('Management API unavailable');
    });
  });
});
