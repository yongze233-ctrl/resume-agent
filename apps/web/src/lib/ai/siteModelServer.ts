import type { SiteModel, SiteModelOption } from './siteModel';
import { deriveProviderId, getProvider } from '@/lib/constants/modals';

function defaultSiteModel(): SiteModel | null {
  if (!process.env.DEFAULT_MODEL_API_KEY?.trim()) return null;
  const limit = Number(process.env.DEFAULT_MODEL_MAX_TOKENS || 12000);
  const baseUrl = (process.env.DEFAULT_MODEL_BASE_URL?.trim() || 'https://opencode.ai/zen/go/v1').replace(/\/+$/, '');
  return {
    provider: deriveProviderId(baseUrl),
    baseUrl,
    model: process.env.DEFAULT_MODEL_NAME?.trim() || 'deepseek-v4.1-flash',
    maxTokens: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 32768) : 12000,
    ...(process.env.NODE_ENV !== 'production' && process.env.LOCAL_DEFAULT_MODEL_SETUP_ID?.trim()
      ? { setupId: process.env.LOCAL_DEFAULT_MODEL_SETUP_ID.trim() } : {}),
  };
}

function configuredSiteModels(): Array<{ metadata: SiteModelOption; apiKey: string }> {
  const models: Array<{ metadata: SiteModelOption; apiKey: string }> = [];
  const preferred = defaultSiteModel();
  if (preferred) {
    models.push({
      metadata: { ...preferred, id: `${preferred.provider}:${preferred.model}` },
      apiKey: process.env.DEFAULT_MODEL_API_KEY!.trim(),
    });
  }
  for (const [providerId, keyVariable] of [
    ['opencode-go', 'SITE_OPENCODE_GO_API_KEY'],
    ['agnes-token-plan', 'SITE_AGNES_API_KEY'],
  ]) {
    const apiKey = process.env[keyVariable]?.trim();
    const provider = getProvider(providerId);
    if (!apiKey || !provider) continue;
    const id = `${provider.id}:${provider.defaultModel}`;
    if (models.some((entry) => entry.metadata.id === id)) continue;
    models.push({
      metadata: { id, provider: provider.id, baseUrl: provider.baseUrl, model: provider.defaultModel, maxTokens: provider.defaultMaxTokens },
      apiKey,
    });
  }
  return models;
}

export function publicSiteModels(): SiteModelOption[] {
  return configuredSiteModels().map((entry) => entry.metadata);
}

export function publicSiteModel(): SiteModel | null {
  const first = publicSiteModels()[0];
  if (!first) return null;
  // Preserve the single-model response used by previously deployed clients.
  const { id: _id, ...metadata } = first;
  return metadata;
}

/** Resolve an explicit server-model reference only at the trusted proxy boundary. */
export function resolveSiteModelConfig(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('source' in value) || value.source !== 'server') return value;
  const requested = value as Record<string, unknown>;
  const models = configuredSiteModels();
  const selected = requested.serverModelId === undefined
    ? models[0]
    : models.find((entry) => entry.metadata.id === requested.serverModelId);
  if (!selected) throw new Error('Site model is not configured');
  const model = selected.metadata;
  return {
    source: 'byok',
    apiKey: selected.apiKey,
    baseUrl: model.baseUrl,
    modelName: model.model,
    maxTokens: model.maxTokens,
    effort: ['low', 'medium', 'high'].includes(String(requested.effort)) ? requested.effort : 'low',
  };
}

export function resolveSiteModelBody(body: BodyInit | null | undefined, contentType: string): BodyInit | null | undefined {
  if (body instanceof FormData) {
    const config = body.get('config');
    if (typeof config === 'string') {
      let parsed: unknown;
      try { parsed = JSON.parse(config); } catch { return body; }
      const resolved = resolveSiteModelConfig(parsed);
      if (resolved !== parsed) body.set('config', JSON.stringify(resolved));
    }
    return body;
  }
  if (!contentType.includes('application/json')) return body;
  const text = typeof body === 'string' ? body : body instanceof ArrayBuffer ? new TextDecoder().decode(body) : null;
  if (!text) return body;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return body; }
  if (!parsed || typeof parsed !== 'object' || !('config' in parsed)) return body;
  const resolved = resolveSiteModelConfig(parsed.config);
  return resolved === parsed.config ? body : JSON.stringify({ ...parsed, config: resolved });
}
