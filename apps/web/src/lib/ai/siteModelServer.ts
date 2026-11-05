import type { SiteModel } from './siteModel';
import { deriveProviderId } from '@/lib/constants/modals';

export function publicSiteModel(): SiteModel | null {
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

/** Resolve an explicit server-model reference only at the trusted proxy boundary. */
export function resolveSiteModelConfig(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('source' in value) || value.source !== 'server') return value;
  const model = publicSiteModel();
  if (!model) throw new Error('Site model is not configured');
  const requested = value as Record<string, unknown>;
  return {
    source: 'byok',
    apiKey: process.env.DEFAULT_MODEL_API_KEY!.trim(),
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
