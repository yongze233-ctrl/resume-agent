import { AsyncLocalStorage } from 'node:async_hooks';
import { join } from 'node:path';
import { AgentError } from '../contracts/errors.js';

export interface SiteUser {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  disabled: boolean;
  createdAt: string;
}
export type ResourceKind = 'session' | 'resume' | 'pencil' | 'artifact';
export interface IdentityContext {
  user: SiteUser;
  assertOwner: (kind: ResourceKind, id: string, claim: boolean, allowMissing: boolean) => void;
  renderTicket: (artifactId: string) => string;
}
export const identityContext = new AsyncLocalStorage<IdentityContext>();
export const currentUserId = () => identityContext.getStore()?.user.id;

export function assertOwned(kind: ResourceKind, id: string | undefined, claim = false, allowMissing = false) {
  if (id) identityContext.getStore()?.assertOwner(kind, id, claim, allowMissing);
}
export function userDataDirectory(dataDir: string, explicitOwner?: string) {
  const owner = explicitOwner ?? currentUserId();
  if (!owner) return dataDir;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(owner)) throw new AgentError(400, 'invalid_input', 'user_id_invalid');
  return join(dataDir, 'users', owner);
}
