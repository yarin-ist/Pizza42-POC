/**
 * Unit tests for JwtStrategy
 *
 * The strategy is a thin Passport adapter. The only custom logic is the
 * validate() method, which passes the decoded JWT payload through to req.user
 * unchanged. This is intentional — the full payload (sub, permissions,
 * https://pizza42.com/email_verified) is needed by the controller.
 *
 * We do NOT test the constructor's JWKS configuration (that requires
 * network access to the Auth0 tenant). Instead we test the contract:
 * validate() returns exactly what it receives.
 *
 * Note: jwks-rsa ships as ES Modules (jose dependency). We mock it here so
 * that Jest (running in CommonJS mode) can parse the import without error.
 * The constructor JWKS wiring is not under test — only validate() is.
 */

// Must be hoisted before any imports — jest.mock is auto-hoisted by babel-jest.
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn().mockReturnValue('__mocked_secret_provider__'),
}));

import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const buildConfigMock = () => ({
  get: jest.fn().mockImplementation((key: string) => {
    const map: Record<string, string> = {
      AUTH0_DOMAIN: 'pizza42-poc-yarin.eu.auth0.com',
      AUTH0_AUDIENCE: 'https://api.pizza42.com',
    };
    return map[key];
  }),
});

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy(buildConfigMock() as unknown as ConfigService);
  });

  describe('validate()', () => {
    it('returns the payload unchanged (pass-through to req.user)', () => {
      const payload = {
        sub: 'auth0|user123',
        iss: 'https://pizza42-poc-yarin.eu.auth0.com/',
        aud: 'https://api.pizza42.com',
        permissions: ['create:orders'],
        'https://pizza42.com/email_verified': true,
      };

      const result = strategy.validate(payload);

      expect(result).toBe(payload);       // same reference
      expect(result).toEqual(payload);    // same content
    });

    it('passes through a minimal payload (sub only)', () => {
      const payload = { sub: 'auth0|abc' };
      expect(strategy.validate(payload)).toEqual(payload);
    });

    it('passes through a payload with all Pizza 42 custom claims', () => {
      const payload = {
        sub: 'auth0|pizza-user',
        permissions: ['create:orders'],
        'https://pizza42.com/email_verified': true,
        iat: 1_716_000_000,
        exp: 1_716_086_400,
      };

      const result = strategy.validate(payload) as typeof payload;

      expect(result['https://pizza42.com/email_verified']).toBe(true);
      expect(result.permissions).toContain('create:orders');
    });

    it('passes through email_verified: false (used by controller to reject orders)', () => {
      const payload = {
        sub: 'auth0|unverified',
        permissions: ['create:orders'],
        'https://pizza42.com/email_verified': false,
      };

      const result = strategy.validate(payload) as typeof payload;
      expect(result['https://pizza42.com/email_verified']).toBe(false);
    });

    it('does not mutate or clone the payload (identity function)', () => {
      const payload = { sub: 'auth0|user', data: { nested: true } };
      const result = strategy.validate(payload);
      expect(result).toBe(payload); // strict reference equality
    });
  });
});
