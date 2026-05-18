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
    // Set the flag BEFORE logout so when the user returns to the app the
    // auto-silent-auth in HomeComponent does not immediately redirect them
    // back to Auth0 (their session was just cleared by the logout call).
    sessionStorage.setItem('_auth_redir', '1');
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
  }
}
