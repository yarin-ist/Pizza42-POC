import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { map } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent {
  readonly auth = inject(AuthService);

  /**
   * Emits true only when the ID token contains "Admin" in the
   * https://pizza42.com/roles claim. Used to show the Admin nav link.
   */
  readonly isAdmin$ = this.auth.idTokenClaims$.pipe(
    map(claims => {
      const roles = claims?.['https://pizza42.com/roles'] as string[] | undefined;
      return roles?.includes('Admin') ?? false;
    }),
  );

  login(): void {
    console.log('[Navbar] Initiating Auth0 Universal Login');
    this.auth.loginWithRedirect();
  }

  logout(): void {
    console.log('[Navbar] Logging out');
    // Clear prior-session marker and block silent re-auth until the user
    // explicitly signs in again from the landing page.
    sessionStorage.removeItem('_auth_session');
    sessionStorage.setItem('_auth_redir', '1');
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
  }
}
