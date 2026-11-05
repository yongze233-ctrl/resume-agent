import { cache } from 'react';
import { fetchAiBackend } from '@/lib/ai/backend';
import type { SiteUser } from './types';

export const siteAccountsEnabled = () => process.env.SITE_AUTH_REQUIRED === 'true';
export const serverAccount = cache(async (): Promise<SiteUser | null> => {
  if (!siteAccountsEnabled()) return null;
  const response = await fetchAiBackend('/api/auth/get-session');
  if (!response.ok) return null;
  const data = await response.json() as { user?: SiteUser | null };
  return data.user && !data.user.disabled ? data.user : null;
});
