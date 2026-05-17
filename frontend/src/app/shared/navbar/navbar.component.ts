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
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
  }
}
