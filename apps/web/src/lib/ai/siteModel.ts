/** Public metadata only. A site's model credential never crosses into browser state. */
export interface SiteModel {
  provider: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  /** Optional one-time local setup revision; contains no credential. */
  setupId?: string;
}
