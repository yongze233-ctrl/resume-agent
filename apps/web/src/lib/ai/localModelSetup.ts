import { dbClient } from '@/lib/api/IndexDBClient';
import { useSettingStore } from '@/store/useSettingStore';

let inFlight: Promise<void> | null = null;

async function acknowledge(setupId: string) {
  await fetch('/api/local-model-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setupId }), credentials: 'same-origin' }).catch(() => undefined);
}

/** Apply an explicitly provisioned local setup once, then use ordinary BYOK storage. */
export function importLocalModelSetup(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const settings = useSettingStore.getState();
      await settings.loadSettings();
      const response = await fetch('/api/local-model-setup', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status !== 200) return;
      const setup: unknown = await response.json();
      if (!setup || typeof setup !== 'object') return;
      const value = setup as Record<string, unknown>;
      if (typeof value.setupId !== 'string' || value.provider !== 'opencode-go' || typeof value.apiKey !== 'string' || !value.apiKey.trim()) return;
      if (await dbClient.getItem('local_model_setup_applied') === value.setupId) {
        await acknowledge(value.setupId);
        return;
      }
      settings.setProvider('opencode-go');
      settings.setApiKey(value.apiKey);
      // Save all fields together; setStrength normally starts a separate write.
      useSettingStore.setState({ strength: 'low' });
      await useSettingStore.getState().saveSettings();
      await dbClient.setItem('local_model_setup_applied', value.setupId);
      await acknowledge(value.setupId);
    } catch {
      // An absent/expired handoff never prevents manually configured BYOK use.
    }
  })().finally(() => { inFlight = null; });
  return inFlight;
}
