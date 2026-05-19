import {
  Controller,
  Get,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';
import type { AdminMetrics } from './admin.service';

interface JwtPayload {
  sub: string;
  permissions?: string[];
}

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /admin/metrics
   *
   * Returns aggregated user and order statistics for the admin dashboard.
   *
   * Access control:
   *   - JwtAuthGuard validates the Bearer token (RS256, Auth0 JWKS).
   *   - The inline permission check enforces `read:all_orders` scope.
   *     This scope is only present in access tokens of users with the Admin role.
   *
   * Why inline check instead of ScopesGuard:
   *   ScopesGuard is currently hardcoded to `create:orders`. Rather than
   *   refactoring the guard before the interview, a direct check here is
   *   explicit, readable, and produces the correct 403 response.
   */
  @Get('metrics')
  @UseGuards(JwtAuthGuard)
  async getMetrics(@Req() req: Request): Promise<AdminMetrics> {
    const user = req.user as JwtPayload;

    if (!user.permissions?.includes('read:all_orders')) {
      throw new ForbiddenException('Insufficient scope: read:all_orders required');
    }

    return this.adminService.getMetrics();
  }
}
