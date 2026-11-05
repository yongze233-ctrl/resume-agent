import { useSettingStore } from "@/store/useSettingStore";
import { opensBillingGate } from "@/lib/errors/types";
import type { AgentLlmConfig } from "./types";

export type AiAccessResult =
  | { ok: true; config: AgentLlmConfig }
  | { ok: false; reason: "custom_config_required" };

/**
 * Prefer a complete personal BYOK configuration. An explicitly provisioned
 * site default carries only a server reference; its key is injected by the
 * trusted proxy and never enters this browser. Otherwise open the config card.
 */
export function resolveAiAccessConfig(): AiAccessResult {
  const settings = useSettingStore.getState();
  const hasOwnConfig = [settings.provider, settings.apiKey, settings.baseUrl, settings.model].every((value) => value.trim())
    && Number.isFinite(Number(settings.maxTokens)) && Number(settings.maxTokens) > 0;
  if (settings.siteModel && (settings.preferSiteModel || !hasOwnConfig)) {
    return {
      ok: true,
      config: { source: 'server', modelName: settings.siteModel.model, maxTokens: settings.siteModel.maxTokens, effort: settings.strength },
    };
  }
  if (!settings.hasLlmConfig()) {
    return { ok: false, reason: "custom_config_required" };
  }
  return {
    ok: true,
    config: {
      source: "byok",
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      modelName: settings.model,
      maxTokens: settings.maxTokens,
      effort: settings.strength,
    },
  };
}

/**
 * Whether a failure means the user's model config cannot run this request, so
 * the model config card should come back: the provider's quota is spent, the
 * model needs a plan the key does not have, the key is rejected or lacks access
 * to the model, or the backend refused the config itself (`misconfigured` with a
 * `model_*` subCode). A backend that is not deployed is not the user's config.
 *
 * Reads the error code where there is one; plain string errors fall back to
 * keywords, without depending on the wording of any one language.
 */
export function isQuotaOrCustomConfigError(error: unknown) {
  const appError = (
    error as { appError?: { errorCode?: unknown; subCode?: unknown } } | null
  )?.appError;
  if (typeof appError?.errorCode === "string") {
    if (appError.subCode === 'user_session_required') return false;
    const code = appError.errorCode;
    return (
      opensBillingGate(code as never) ||
      code === "unauthenticated" ||
      code === "forbidden" ||
      (code === "misconfigured" &&
        typeof appError.subCode === "string" &&
        appError.subCode.startsWith("model_"))
    );
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /quota_exceeded|plan_required|insufficient_quota|insufficient quota|quota|402/i.test(
    message,
  );
}
