import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Named wrapper around AuthGuard('jwt').
// Centralises the strategy name so a future swap (e.g. to API keys)
// requires a single change rather than hunting all @UseGuards call sites.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
