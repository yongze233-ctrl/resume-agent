import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { publicUser, type AccountService } from './service.js';

const allowed = new Set([
  '/get-session', '/sign-in/username', '/sign-out', '/change-password',
  '/admin/create-user', '/admin/list-users', '/admin/ban-user',
  '/admin/unban-user', '/admin/set-user-password', '/admin/revoke-user-sessions',
]);

export function accountRoutes(app: FastifyInstance, accounts: AccountService | undefined) {
  app.route({ method: ['GET','POST'], url: '/api/auth/*', bodyLimit: 16384, async handler(request,reply) {
    const path = new URL(request.url,'http://localhost').pathname.slice('/api/auth'.length);
    reply.header('Cache-Control','no-store, private');
    if (!accounts) return path === '/get-session' ? { enabled: false, user: null } : reply.code(404).send({ code: 'AUTH_DISABLED' });
    if (!allowed.has(path)) return reply.code(404).send({ code: 'NOT_FOUND' });
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string,unknown> : {};
    if (path.startsWith('/admin/')) {
      const actor = await accounts.user(request);
      if (actor?.role !== 'admin') return reply.code(403).send({ code: 'FORBIDDEN' });
      if (path === '/admin/create-user') {
        const data = body.data && typeof body.data === 'object' ? body.data as Record<string,unknown> : {};
        const name = String(data.username ?? '').trim().toLowerCase();
        if (!/^[a-z0-9_-]{3,30}$/.test(name) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) return reply.code(400).send({ code: 'INVALID_USER_INPUT' });
        body.role = 'user'; body.email = `${name}@accounts.invalid`;
        body.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0,80) : name;
        body.data = { username: name, displayUsername: name };
      } else if (request.method === 'POST' && typeof body.userId === 'string') {
        const target = accounts.db.prepare('SELECT role FROM user WHERE id=?').get(body.userId) as {role:string} | undefined;
        if (target?.role === 'admin') return reply.code(400).send({ code: 'ADMIN_ACCOUNT_PROTECTED' });
      }
    }
    const response = await accounts.auth.handler(new Request(new URL(request.url,accounts.settings.auth!.origin), {
      method: request.method, headers: fromNodeHeaders(request.headers),
      ...(request.method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    }));
    reply.code(response.status);
    const cookies = response.headers.getSetCookie();
    const data: unknown = await response.json().catch(() => null);
    const result = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    if (!response.ok) {
      if (cookies.length) reply.header('Set-Cookie', cookies);
      return { code: typeof result.code === 'string' ? result.code : 'AUTH_FAILED' };
    }
    if (path === '/admin/set-user-password' && typeof body.userId === 'string') {
      await (await accounts.auth.$context).internalAdapter.deleteUserSessions(body.userId);
    }
    const user = publicUser(result.user);
    const cookieSuffix = `; Path=/; SameSite=Lax${accounts.settings.auth!.origin.startsWith('https:') ? '; Secure' : ''}`;
    // An admin response may describe a newly-created user, not the signed-in actor.
    if (user && (path === '/get-session' || path === '/sign-in/username')) cookies.push(`resume_user_id=${encodeURIComponent(user.id)}; Max-Age=604800${cookieSuffix}`);
    if (path === '/sign-out' || (path === '/get-session' && !user)) cookies.push(`resume_user_id=; Max-Age=0${cookieSuffix}`);
    if (cookies.length) reply.header('Set-Cookie',cookies);
    if (path === '/admin/list-users') return { users: Array.isArray(result.users) ? result.users.map(publicUser).filter(Boolean) : [], total: result.total ?? 0 };
    // Session tokens and credential records never enter frontend JSON responses.
    return { enabled: true, user, success: true };
  }});
}
