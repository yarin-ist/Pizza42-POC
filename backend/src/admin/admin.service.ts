import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ManagementClient } from 'auth0';
import type { Order } from '../orders/orders.service';

export interface ToppingCount { topping: string; count: number }
export interface SizeCount    { size: string;    count: number }
export interface CrustCount   { crust: string;   count: number }

export interface AdminMetrics {
  totalUsers:   number;
  totalOrders:  number;
  activeUsers:  number; // users who placed at least one order
  topToppings:  ToppingCount[];
  topSizes:     SizeCount[];
  topCrusts:    CrustCount[];
}

@Injectable()
export class AdminService implements OnModuleInit {
  private managementClient: ManagementClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.managementClient = new ManagementClient({
      domain:       this.configService.getOrThrow<string>('AUTH0_DOMAIN'),
      clientId:     this.configService.getOrThrow<string>('M2M_CLIENT_ID'),
      clientSecret: this.configService.getOrThrow<string>('M2M_CLIENT_SECRET'),
    });
  }

  async getMetrics(): Promise<AdminMetrics> {
    // Fetch all users (up to 100 — more than enough for a POC tenant).
    // We only request the fields we need to keep the payload small.
    const { data: users } = await this.managementClient.users.getAll({
      fields:   'user_id,app_metadata',
      per_page: 100,
      page:     0,
    });

    // Aggregate order data from every user's app_metadata.orders array
    const toppingCounter: Record<string, number> = {};
    const sizeCounter:    Record<string, number> = {};
    const crustCounter:   Record<string, number> = {};
    let totalOrders = 0;
    let activeUsers = 0;

    for (const user of users) {
      const orders: Order[] =
        (user.app_metadata as { orders?: Order[] } | undefined)?.orders ?? [];

      if (orders.length > 0) activeUsers++;
      totalOrders += orders.length;

      for (const order of orders) {
        // Toppings — each order can have multiple
        for (const t of order.toppings ?? []) {
          toppingCounter[t] = (toppingCounter[t] ?? 0) + 1;
        }
        // Size
        if (order.size) {
          sizeCounter[order.size] = (sizeCounter[order.size] ?? 0) + 1;
        }
        // Crust
        if (order.crust) {
          crustCounter[order.crust] = (crustCounter[order.crust] ?? 0) + 1;
        }
      }
    }

    return {
      totalUsers:  users.length,
      totalOrders,
      activeUsers,
      topToppings: this.topN(toppingCounter, 5).map(([topping, count]) => ({ topping, count })),
      topSizes:    this.topN(sizeCounter,    5).map(([size,    count]) => ({ size,    count })),
      topCrusts:   this.topN(crustCounter,   5).map(([crust,  count]) => ({ crust,   count })),
    };
  }

  /** Returns the top-N entries of a counter map, sorted by count descending */
  private topN(counter: Record<string, number>, n: number): [string, number][] {
    return Object.entries(counter)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n);
  }
}
