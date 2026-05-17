/**
 * Unit tests for OrdersService
 *
 * Tests order creation with a fully mocked Auth0 ManagementClient.
 * All calls to Auth0's Management API are intercepted — no real network calls.
 *
 * POC Requirements covered:
 *   Req 9  — "After an order is placed, save the order to the user's Auth0 profile"
 *   Req 5  — verify the API call structure (POST /orders → app_metadata update)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';

import { OrdersService } from './orders.service';
import type { Order } from './orders.service';

// ─── ManagementClient mock factory ───────────────────────────────────────────

const buildMgmtClientMock = (existingOrders: Order[] = []) => ({
  users: {
    get: jest.fn().mockResolvedValue({
      data: {
        user_id: 'auth0|user123',
        app_metadata: existingOrders.length ? { orders: existingOrders } : {},
      },
    }),
    update: jest.fn().mockResolvedValue({ data: {} }),
  },
});

// ─── ConfigService mock ───────────────────────────────────────────────────────

const buildConfigMock = () => ({
  getOrThrow: jest.fn().mockImplementation((key: string) => {
    const map: Record<string, string> = {
      AUTH0_DOMAIN: 'pizza42-poc-yarin.eu.auth0.com',
      M2M_CLIENT_ID: 'test-client-id',
      M2M_CLIENT_SECRET: 'test-client-secret',
    };
    return map[key] ?? (() => { throw new Error(`Unknown config key: ${key}`); })();
  }),
});

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let service: OrdersService;
  let mgmtMock: ReturnType<typeof buildMgmtClientMock>;

  const setupService = async (existingOrders: Order[] = []) => {
    mgmtMock = buildMgmtClientMock(existingOrders);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: ConfigService, useValue: buildConfigMock() },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    // Inject the mock directly — bypasses real Auth0 SDK initialisation
    (service as any).managementClient = mgmtMock;
  };

  const dto = { pizza: 'Margherita', size: 'large' };

  // ── Req 9 — Persist order to Auth0 app_metadata ───────────────────────────

  describe('createOrder() — Req 9: save order to user Auth0 profile', () => {
    it('creates an order with a unique id and ISO timestamp', async () => {
      await setupService();
      const result = await service.createOrder('auth0|user123', dto);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('returns an order containing all DTO fields', async () => {
      await setupService();
      const result = await service.createOrder('auth0|user123', dto);

      expect(result.pizza).toBe('Margherita');
      expect(result.size).toBe('large');
    });

    it('calls users.get to read current app_metadata (avoids overwriting history)', async () => {
      await setupService();
      await service.createOrder('auth0|user123', dto);

      expect(mgmtMock.users.get).toHaveBeenCalledWith({ id: 'auth0|user123' });
    });

    it('calls users.update with the correct sub (Req 9 — persists to profile)', async () => {
      await setupService();
      await service.createOrder('auth0|user123', dto);

      expect(mgmtMock.users.update).toHaveBeenCalledWith(
        { id: 'auth0|user123' },
        expect.objectContaining({
          app_metadata: expect.objectContaining({ orders: expect.any(Array) }),
        }),
      );
    });

    it('new user (no prior orders): update is called with an array of exactly 1 order', async () => {
      await setupService([]); // empty app_metadata
      await service.createOrder('auth0|user123', dto);

      const updateCall = mgmtMock.users.update.mock.calls[0];
      const updatedOrders = updateCall[1].app_metadata.orders as Order[];
      expect(updatedOrders).toHaveLength(1);
      expect(updatedOrders[0].pizza).toBe('Margherita');
    });

    it('returning user (1 existing order): update is called with 2 orders — new appended last', async () => {
      const existingOrder: Order = { id: 'old-order', pizza: 'Pepperoni', size: 'small', timestamp: '2026-01-01T00:00:00Z' };
      await setupService([existingOrder]);

      const result = await service.createOrder('auth0|user123', dto);

      const updateCall = mgmtMock.users.update.mock.calls[0];
      const updatedOrders = updateCall[1].app_metadata.orders as Order[];
      expect(updatedOrders).toHaveLength(2);
      expect(updatedOrders[0]).toEqual(existingOrder);   // original first
      expect(updatedOrders[1].id).toBe(result.id);       // new appended
    });

    it('each order id is unique (crypto.randomUUID not stubbed)', async () => {
      await setupService();
      const order1 = await service.createOrder('auth0|user123', dto);
      mgmtMock.users.get.mockResolvedValueOnce({ data: { app_metadata: { orders: [order1] } } });
      const order2 = await service.createOrder('auth0|user123', dto);

      expect(order1.id).not.toBe(order2.id);
    });
  });

  // ── Error propagation ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws InternalServerErrorException when users.get fails', async () => {
      await setupService();
      mgmtMock.users.get.mockRejectedValue(new Error('Auth0 rate limit'));

      await expect(service.createOrder('auth0|user123', dto))
        .rejects.toThrow(InternalServerErrorException);
    });

    it('throws InternalServerErrorException when users.update fails', async () => {
      await setupService();
      mgmtMock.users.update.mockRejectedValue(new Error('Connection timeout'));

      await expect(service.createOrder('auth0|user123', dto))
        .rejects.toThrow(InternalServerErrorException);
    });

    it('includes the original error message in the InternalServerErrorException', async () => {
      await setupService();
      mgmtMock.users.get.mockRejectedValue(new Error('Specific upstream error'));

      try {
        await service.createOrder('auth0|user123', dto);
        fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InternalServerErrorException);
        expect((err as InternalServerErrorException).message).toContain('Specific upstream error');
      }
    });

    it('does NOT call users.update when users.get fails (no partial writes)', async () => {
      await setupService();
      mgmtMock.users.get.mockRejectedValue(new Error('Network error'));

      try { await service.createOrder('auth0|user123', dto); } catch {}

      expect(mgmtMock.users.update).not.toHaveBeenCalled();
    });
  });
});
