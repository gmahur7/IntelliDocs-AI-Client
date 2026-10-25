export const ROLES = ['USER', 'ADMIN', 'GUEST'] as const;
export type Role = (typeof ROLES)[number];

export const LOGIN_PATH = '/sign-in';
export const PUBLIC_PATHS = ['/sign-in', '/sign-up'] as const;
export const SESSION_EXPIRED_PATH = '/api/auth/session-expired';

export const HOME: Record<Role, string> = {
  USER: '/',
  ADMIN: '/admin',
  GUEST: '/',
};

// Page ownership: everything under /admin belongs to ADMIN, every other page belongs to
// members (USER, GUEST). A role may only visit pages it owns; the proxy and the layouts
// both enforce this, so an admin is never served member pages and vice versa.
export const MEMBER_ROLES: readonly Role[] = ['USER', 'GUEST'];

export function mayVisit(pathname: string, role: Role): boolean {
  return under(pathname, '/admin') ? role === 'ADMIN' : MEMBER_ROLES.includes(role);
}

export type Verdict =
  | { type: 'allow' }
  | { type: 'redirect'; to: string }
  | { type: 'reject'; status: 401 | 403 };

export const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

export function decide(pathname: string, role: Role | null): Verdict {
  if (under(pathname, '/api/auth')) return { type: 'allow' };

  if (under(pathname, '/api')) {
    if (!role) return { type: 'reject', status: 401 };
    if (under(pathname, '/api/admin') && role !== 'ADMIN') return { type: 'reject', status: 403 };
    return { type: 'allow' };
  }

  if (PUBLIC_PATHS.some((path) => under(pathname, path))) {
    return role ? { type: 'redirect', to: HOME[role] } : { type: 'allow' };
  }

  if (!role) return { type: 'redirect', to: LOGIN_PATH };

  return mayVisit(pathname, role) ? { type: 'allow' } : { type: 'redirect', to: HOME[role] };
}
