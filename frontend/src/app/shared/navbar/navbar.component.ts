import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent {
  readonly auth = inject(AuthService);

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
