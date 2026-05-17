/**
 * Unit tests for ScopesGuard
 *
 * POC Requirement 8: "The API endpoint servicing the orders request must require
 * a valid token as well as a specific scope for the operation to complete."
 *
 * ScopesGuard enforces the `create:orders` permission from the JWT payload.
 * These tests confirm the guard is correctly strict: only exact permission grants access.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ScopesGuard } from './scopes.guard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds a minimal NestJS ExecutionContext mock with the given user object
 * attached to the HTTP request.
 */
function buildContext(user: Record<string, unknown> | null): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('ScopesGuard — Req 8: create:orders scope enforcement', () => {
  let guard: ScopesGuard;

  beforeEach(() => {
    guard = new ScopesGuard();
  });

  // ── Positive paths ─────────────────────────────────────────────────────────

  it('returns true when user has exactly the create:orders permission', () => {
    const ctx = buildContext({ permissions: ['create:orders'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when user has create:orders among multiple permissions', () => {
    const ctx = buildContext({ permissions: ['read:menu', 'create:orders', 'read:orders'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  // ── Negative paths ─────────────────────────────────────────────────────────

  it('throws ForbiddenException when permissions array is empty', () => {
    const ctx = buildContext({ permissions: [] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when permissions array contains only wrong scopes', () => {
    const ctx = buildContext({ permissions: ['read:menu', 'read:orders'] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when permissions key is missing from user', () => {
    const ctx = buildContext({ sub: 'auth0|123' }); // no permissions key
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when req.user is undefined', () => {
    const ctx = buildContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for a partial match (create:order without trailing s)', () => {
    const ctx = buildContext({ permissions: ['create:order'] }); // missing the 's'
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  // ── Error message quality ──────────────────────────────────────────────────

  it('ForbiddenException message mentions the required scope', () => {
    const ctx = buildContext({ permissions: [] });
    try {
      guard.canActivate(ctx);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const message = (err as ForbiddenException).message;
      expect(message.toLowerCase()).toContain('create:orders');
    }
  });
});
