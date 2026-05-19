import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface ToppingCount { topping: string; count: number }
export interface SizeCount    { size: string;    count: number }
export interface CrustCount   { crust: string;   count: number }

export interface AdminMetrics {
  totalUsers:   number;
  totalOrders:  number;
  activeUsers:  number;
  topToppings:  ToppingCount[];
  topSizes:     SizeCount[];
  topCrusts:    CrustCount[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches admin metrics from GET /admin/metrics.
   * The authHttpInterceptorFn attaches the Bearer token automatically.
   * The token must contain the `read:all_orders` permission (Admin role only).
   */
  getMetrics(): Observable<AdminMetrics> {
    return this.http.get<AdminMetrics>(`${environment.apiUrl}/admin/metrics`);
  }
}
