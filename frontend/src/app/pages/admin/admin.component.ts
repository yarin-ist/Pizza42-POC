import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../core/services/admin.service';
import type { AdminMetrics } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin.component.html',
})
export class AdminComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly metrics   = signal<AdminMetrics | null>(null);
  readonly loading   = signal(true);
  readonly error     = signal<string | null>(null);

  ngOnInit(): void {
    this.adminService.getMetrics().subscribe({
      next: (data) => {
        this.metrics.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[Admin] Failed to load metrics', err);
        this.error.set('Failed to load metrics. Make sure you have the Admin role.');
        this.loading.set(false);
      },
    });
  }

  /** Percentage of users who have placed at least one order */
  conversionRate(m: AdminMetrics): string {
    if (m.totalUsers === 0) return '0%';
    return ((m.activeUsers / m.totalUsers) * 100).toFixed(0) + '%';
  }

  /** Average orders per active user */
  avgOrdersPerUser(m: AdminMetrics): string {
    if (m.activeUsers === 0) return '0';
    return (m.totalOrders / m.activeUsers).toFixed(1);
  }
}
