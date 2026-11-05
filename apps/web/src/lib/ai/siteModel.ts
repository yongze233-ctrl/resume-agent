/** Public metadata only. A site's model credential never crosses into browser state. */
export interface SiteModel {
  provider: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  /** Optional one-time local setup revision; contains no credential. */
  setupId?: string;
}

export interface SiteModelOption extends SiteModel {
  id: string;
}

export function selectedSiteModel(settings: {
  siteModel: SiteModel | null;
  siteModels: SiteModelOption[];
  selectedSiteModelId: string;
}): SiteModel | SiteModelOption | null {
  return settings.siteModels.find((model) => model.id === settings.selectedSiteModelId)
    ?? settings.siteModels[0]
    ?? settings.siteModel;
}
