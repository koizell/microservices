import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
  ) {}

  private normalizeRole(role?: string): string {
    const normalized = String(role ?? 'guest').toLowerCase();
    if (normalized === 'standar') return 'standard';
    if (normalized === 'invitado') return 'guest';
    return normalized;
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());

    // Si el endpoint no tiene roles requeridos, permite acceso
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new ForbiddenException('Token requerido');
    }

    const token = authHeader.slice('Bearer '.length);
    const secret = process.env.JWT_SECRET ?? 'dev_only_change_me';

    try {
      const decoded = this.jwtService.verify(token, { secret });
      const userRole = this.normalizeRole(decoded.accountType || decoded.role || 'guest');
      const normalizedRequiredRoles = requiredRoles.map((role) => this.normalizeRole(role));

      // Verificar si el rol del usuario estÃ¡ en los roles permitidos
      if (!normalizedRequiredRoles.includes(userRole)) {
        throw new ForbiddenException(
          `Acceso denegado. Rol requerido: ${requiredRoles.join(' o ')}. Rol actual: ${userRole}`,
        );
      }

      // Adjuntar el usuario al request para usarlo en el controlador
      request.user = decoded;
      return true;
    } catch (error) {
      throw new ForbiddenException(`Token invÃ¡lido: ${error.message}`);
    }
  }
}

