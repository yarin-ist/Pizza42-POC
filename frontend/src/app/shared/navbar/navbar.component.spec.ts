/**
 * Unit tests for NavbarComponent
 *
 * POC Requirements covered:
 *   Req 4 — Login via Auth0 Universal Login (login() calls loginWithRedirect)
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of } from 'rxjs';

import { NavbarComponent } from './navbar.component';

const buildAuthMock = () => ({
  isAuthenticated$: of(true),
  user$: of({ email: 'test@pizza42.com', name: 'Test', picture: '', email_verified: true }),
  loginWithRedirect: vi.fn(),
  logout: vi.fn(),
});

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let authMock: ReturnType<typeof buildAuthMock>;

  beforeEach(() => {
    authMock = buildAuthMock();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
      ],
    });
    component = TestBed.runInInjectionContext(() => new NavbarComponent());
  });

  describe('login() — Req 4', () => {
    it('delegates to auth.loginWithRedirect()', () => {
      component.login();
      expect(authMock.loginWithRedirect).toHaveBeenCalledTimes(1);
    });

    it('passes no explicit arguments — uses Auth0 universal login defaults', () => {
      component.login();
      expect(authMock.loginWithRedirect).toHaveBeenCalledWith();
    });
  });

  describe('logout()', () => {
    it('delegates to auth.logout()', () => {
      component.logout();
      expect(authMock.logout).toHaveBeenCalledTimes(1);
    });

    it('passes returnTo: window.location.origin so the user lands back on the app', () => {
      component.logout();
      expect(authMock.logout).toHaveBeenCalledWith({
        logoutParams: { returnTo: window.location.origin },
      });
    });
  });
});
