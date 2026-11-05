import { useSettingStore } from '@/store/useSettingStore';
import type { SiteModel, SiteModelOption } from './siteModel';
import { dbClient } from '@/lib/api/IndexDBClient';

let inFlight: Promise<void> | null = null;

function isSiteModel(value: unknown): value is SiteModel {
  if (!value || typeof value !== 'object') return false;
  const model = value as SiteModel;
  return typeof model.provider === 'string' && typeof model.model === 'string' && typeof model.baseUrl === 'string'
    && typeof model.maxTokens === 'number' && Number.isFinite(model.maxTokens) && model.maxTokens > 0;
}

export function loadSiteModel(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = fetchSiteModel().finally(() => { inFlight = null; });
  return inFlight;
}

async function fetchSiteModel() {
  try {
    const response = await fetch('/api/site-model', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8000) });
    if (response.status === 204) {
      useSettingStore.setState({ siteModel: null, siteModels: [] });
      return;
    }
    if (response.status !== 200) return;
    const model = await response.json() as SiteModel & { models?: unknown[] };
    if (!isSiteModel(model)) return;
    const siteModels = Array.isArray(model.models)
      ? model.models.filter((entry): entry is SiteModelOption => isSiteModel(entry) && 'id' in entry && typeof entry.id === 'string' && !!entry.id)
      : [];
    useSettingStore.setState({ siteModel: model, siteModels });
    // An operator's explicit local setup is applied once. Preserve the personal
    // key encrypted in storage so choosing the shared default is reversible.
    if (typeof model.setupId === 'string' && model.setupId) {
      await useSettingStore.getState().loadSettings();
      if (await dbClient.getItem('site_model_setup_applied') !== model.setupId) {
        useSettingStore.getState().setPreferSiteModel(true);
        await useSettingStore.getState().saveSettings();
        await dbClient.setItem('site_model_setup_applied', model.setupId);
      }
    }
  } catch { /* BYOK remains available when no site default is provisioned. */ }
}
