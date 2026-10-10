import type { Role } from '@/types/api/auth';

export const AUTH_ROUTES = ['/sign-in', '/sign-up'];

export const ADMIN_PREFIX = '/admin';

export const ROLE_HOME: Record<Role, string> = {
  ADMIN: ADMIN_PREFIX,
  USER: '/',
};

export function matches(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

// `/admin/*` belongs to admins; every other non-auth route belongs to users.
export function routeRole(pathname: string): Role {
  return matches(pathname, [ADMIN_PREFIX]) ? 'ADMIN' : 'USER';
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && value in ROLE_HOME;
}
