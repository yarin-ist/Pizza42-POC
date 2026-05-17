import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

// Checks the `permissions` array in the validated JWT payload.
//
// Why `permissions` and not `scope`:
//   RBAC is enabled on the API and "Add Permissions in the Access Token" is ON
//   in the Auth0 dashboard. Auth0 therefore emits granted permissions in the
//   `permissions` array rather than as a space-delimited `scope` string.
//
//   On first login the RBAC pipeline runs before the Post-Login Action and sees
//   zero roles, so `permissions` would be empty. The Action bridges this gap by
//   calling api.accessToken.setCustomClaim('permissions', ['create:orders']) for
//   the first session only. From the second login onward, RBAC populates the
//   `permissions` array automatically from the assigned Customer role.
@Injectable()
export class ScopesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: { permissions?: string[] };
    }>();

    if (!request.user?.permissions?.includes('create:orders')) {
      throw new ForbiddenException('Insufficient scope: create:orders required');
    }

    return true;
  }
}
