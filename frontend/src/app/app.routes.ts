import { Routes } from '@angular/router';
import { AuthGuard } from '@auth0/auth0-angular';

import { HomeComponent } from './pages/home/home.component';
import { OrderComponent } from './pages/order/order.component';

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
    path: '**',
    redirectTo: '',
  },
];
