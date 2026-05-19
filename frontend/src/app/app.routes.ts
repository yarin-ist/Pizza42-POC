import { Routes } from '@angular/router';
import { AuthGuard } from '@auth0/auth0-angular';

import { HomeComponent } from './pages/home/home.component';
import { OrderComponent } from './pages/order/order.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { AdminComponent } from './pages/admin/admin.component';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    // Public home route — unauthenticated visitors see the landing/hero page.
    // Authenticated users see their dashboard with order history.
    path: '',
    component: HomeComponent,
  },
  {
    // Protected order route — AuthGuard redirects unauthenticated users to
    // Auth0 Universal Login. Email verification is enforced by the pre-navigation
    // check in the Home component's "Order Now" button, NOT here in the guard.
    path: 'order',
    component: OrderComponent,
    canActivate: [AuthGuard],
  },
  {
    // Protected profile route — shows the user's enriched profile data sourced
    // from the ID token custom claims set by the Post-Login Action.
    path: 'profile',
    component: ProfileComponent,
    canActivate: [AuthGuard],
  },
  {
    // Admin-only route — protected by AuthGuard (authentication) and adminGuard
    // (authorization: requires the "Admin" role in the ID token roles claim).
    // Non-admin users are silently redirected to home.
    path: 'admin',
    component: AdminComponent,
    canActivate: [AuthGuard, adminGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
