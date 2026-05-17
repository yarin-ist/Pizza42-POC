import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      // Dynamically fetches Auth0's RS256 public keys from the JWKS endpoint.
      // We never store a private secret — this is the correct RS256 pattern.
      secretOrKeyProvider: passportJwtSecret({
        cache: true,                   // Caches the public key locally
        rateLimit: true,               // Prevents JWKS endpoint hammering on key rotation
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${configService.get<string>('AUTH0_DOMAIN')}/.well-known/jwks.json`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      audience: configService.get<string>('AUTH0_AUDIENCE'),
      issuer: `https://${configService.get<string>('AUTH0_DOMAIN')}/`,
      // Explicitly reject HS256 to prevent algorithm confusion attacks
      algorithms: ['RS256'],
    });
  }

  // Return the full decoded payload so req.user contains all claims:
  // sub, permissions[], https://pizza42.com/email_verified, etc.
  validate(payload: unknown): unknown {
    return payload;
  }
}
