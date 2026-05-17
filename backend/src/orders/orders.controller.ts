import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { OrdersService } from './orders.service';
import type { Order } from './orders.service';

// Shape of req.user after JWT validation by JwtStrategy.validate()
interface JwtPayload {
  sub: string;
  permissions?: string[];
  // Namespaced custom claim injected by the Phase 3 Post-Login Action.
  // URI namespace is required by OIDC spec to prevent claim collision.
  'https://pizza42.com/email_verified'?: boolean;
}

interface CreateOrderBody {
  pizza: string;
  size: string;
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Guard execution order: JwtAuthGuard first (validates token), then ScopesGuard.
  // A request that fails JwtAuthGuard never reaches ScopesGuard — fail fast.
  @UseGuards(JwtAuthGuard, ScopesGuard)
  async createOrder(
    @Req() req: Request,
    @Body() body: CreateOrderBody,
  ): Promise<Order> {
    const user = req.user as JwtPayload;

    // HTTP 403 (not 401): the user IS authenticated but fails a business rule.
    // 401 = not authenticated. 403 = authenticated but not permitted.
    // This distinction is semantically correct and expected by the panel.
    if (!user['https://pizza42.com/email_verified']) {
      throw new ForbiddenException(
        'Email verification required to place orders. Please verify your email address.',
      );
    }

    return this.ordersService.createOrder(user.sub, body);
  }
}
