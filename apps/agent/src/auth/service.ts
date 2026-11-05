import Database from 'better-sqlite3';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { admin, username } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import type { Settings } from '../config.js';
import { Ownership } from './ownership.js';
import { identityContext, type IdentityContext, type SiteUser } from './context.js';

export function publicUser(value: unknown): SiteUser | null {
  if (!value || typeof value !== 'object') return null;
  const user = value as Record<string, unknown>;
  if (typeof user.id !== 'string' || typeof user.name !== 'string') return null;
  return {
    id: user.id, name: user.name,
    username: typeof user.username === 'string' ? user.username : '',
    role: user.role === 'admin' ? 'admin' : 'user', disabled: user.banned === true,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt ?? ''),
  };
}

export class AccountService {
  readonly db: Database.Database;
  readonly auth: ReturnType<typeof betterAuth>;
  private readonly tickets = new Map<string, { user: SiteUser; artifactId: string; expires: number }>();
  constructor(readonly settings: Settings, readonly owners: Ownership) {
    const options = settings.auth!;
    this.db = new Database(join(settings.dataDir, 'accounts.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    const authOptions: BetterAuthOptions = {
      appName: 'Resume Agent', baseURL: options.origin, secret: options.secret,
      database: this.db, trustedOrigins: [options.origin],
      emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
      plugins: [username({ usernameValidator: (value) => /^[a-z0-9_-]{3,30}$/i.test(value) }), admin()],
      session: { expiresIn: 7 * 86400, cookieCache: { enabled: false } },
      rateLimit: { enabled: true, customRules: { '/sign-in/username': { window: 60, max: 10 } } },
      advanced: { ipAddress: { ipAddressHeaders: ['x-auth-client'] }, useSecureCookies: new URL(options.origin).protocol === 'https:' },
      telemetry: { enabled: false },
      logger: { disabled: true },
    };
    this.auth = betterAuth(authOptions);
  }
  async initialize() {
    await (await getMigrations(this.auth.options)).runMigrations();
    const count = this.db.prepare('SELECT COUNT(*) AS n FROM user').get() as { n: number };
    if (count.n) return;
    const { bootstrapUsername, bootstrapPassword } = this.settings.auth!;
    if (!bootstrapUsername || !bootstrapPassword || bootstrapPassword.length < 12) throw new Error('Initial administrator credentials must be provisioned');
    const context = await this.auth.$context;
    const password = await context.password.hash(bootstrapPassword);
    const user = await context.internalAdapter.createUser({
      email: `${bootstrapUsername.toLowerCase()}@accounts.invalid`, name: '管理员',
      username: bootstrapUsername.toLowerCase(), displayUsername: bootstrapUsername,
      role: 'admin', emailVerified: true,
    }, { method: 'email-password' });
    try {
      await context.internalAdapter.linkAccount({ userId: user.id, accountId: user.id, providerId: 'credential', password });
    } catch (error) {
      await context.internalAdapter.deleteUser(user.id);
      throw error;
    }
  }
  async user(request: FastifyRequest) {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    const user = publicUser(session?.user);
    return user && !user.disabled ? user : null;
  }
  context(user: SiteUser): IdentityContext {
    return {
      user,
      assertOwner: (kind,id,claim,allowMissing) => this.owners.assert(user.id,kind,id,claim,allowMissing),
      renderTicket: (artifactId) => {
        this.owners.assert(user.id,'artifact',artifactId,false,false);
        for (const [token, ticket] of this.tickets) if (ticket.expires < Date.now()) this.tickets.delete(token);
        const token = randomBytes(32).toString('base64url');
        this.tickets.set(token, { user, artifactId, expires: Date.now() + 120000 });
        return token;
      },
    };
  }
  renderUser(request: FastifyRequest) {
    const token = request.headers['x-resume-render-token'];
    const ticket = typeof token === 'string' ? this.tickets.get(token) : undefined;
    if (!ticket || ticket.expires < Date.now() || request.method !== 'GET' || request.url.split('?')[0] !== `/api/design-artifacts/${ticket.artifactId}`) return null;
    return ticket.user;
  }
  installRequestContext(request: FastifyRequest, done: () => void, user: SiteUser) {
    identityContext.run(this.context(user), done);
  }
  close() { this.db.close(); }
}
