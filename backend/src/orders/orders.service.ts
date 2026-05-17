import { Injectable, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ManagementClient } from 'auth0';

export interface Order {
  id: string;
  pizza: string;
  size: string;
  timestamp: string;
}

export interface CreateOrderDto {
  pizza: string;
  size: string;
}

@Injectable()
export class OrdersService implements OnModuleInit {
  private managementClient: ManagementClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    // ManagementClient is instantiated ONCE at application startup (singleton).
    // The auth0 SDK manages the M2M client-credentials token internally:
    // it fetches a new token only when the cached one expires (~86400s lifetime).
    // This single instance + its cached token persist for the server's lifetime,
    // satisfying the rate-limit defense without extra caching infrastructure.
    this.managementClient = new ManagementClient({
      domain: this.configService.getOrThrow<string>('AUTH0_DOMAIN'),
      clientId: this.configService.getOrThrow<string>('M2M_CLIENT_ID'),
      clientSecret: this.configService.getOrThrow<string>('M2M_CLIENT_SECRET'),
    });
  }

  async createOrder(sub: string, orderData: CreateOrderDto): Promise<Order> {
    const newOrder: Order = {
      id: crypto.randomUUID(),
      pizza: orderData.pizza,
      size: orderData.size,
      timestamp: new Date().toISOString(),
    };

    try {
      // Fetch the user's current app_metadata to read existing orders
      const { data: user } = await this.managementClient.users.get({ id: sub });
      const existingOrders: Order[] =
        (user.app_metadata as { orders?: Order[] } | undefined)?.orders ?? [];

      // Append new order and PATCH the full updated array back to Auth0.
      // Auth0's PATCH on app_metadata merges at the top level — supplying
      // the full `orders` array replaces it atomically.
      await this.managementClient.users.update(
        { id: sub },
        { app_metadata: { orders: [...existingOrders, newOrder] } },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        `Failed to persist order to Auth0: ${message}`,
      );
    }

    return newOrder;
  }
}
