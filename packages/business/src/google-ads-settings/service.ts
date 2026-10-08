import {
  type GoogleAdsConsent,
  googleAdsConsentSchema,
  googleAdsSettingsDocumentSchema,
  NOT_PROVIDED_CONSENT,
} from "@chatbotx.io/database/partials"
import { googleAdsSettingsRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { validationException } from "../errors"

export type GoogleAdsConsentLoad =
  | { status: "absent"; consent: typeof NOT_PROVIDED_CONSENT }
  | { status: "ok"; consent: GoogleAdsConsent }
  | { status: "invalid" }

/**
 * Workspace-owned Google Ads options (they outlive a disconnect). Not cached:
 * one indexed row per conversion is cheap, and a saved change must apply to the
 * very next conversion with no invalidation step.
 */
class GoogleAdsSettingsService extends BaseService {
  /**
   * No row is "absent" (nothing provided); a row that fails the versioned
   * document schema, unknown version included, is "invalid" so a caller can
   * refuse instead of guessing.
   */
  async getConsent(workspaceId: string): Promise<GoogleAdsConsentLoad> {
    const row = await googleAdsSettingsRepository.findByWorkspaceId(workspaceId)
    if (!row) {
      return { status: "absent", consent: NOT_PROVIDED_CONSENT }
    }
    const document = googleAdsSettingsDocumentSchema.safeParse(row.settings)
    if (!document.success) {
      return { status: "invalid" }
    }
    return { status: "ok", consent: document.data.consent }
  }

  async updateConsent(
    workspaceId: string,
    consent: GoogleAdsConsent,
  ): Promise<GoogleAdsConsent> {
    const parsed = googleAdsConsentSchema.safeParse(consent)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw validationException(
        issue?.path.join(".") || "consent",
        issue?.message ?? "Invalid Google Ads consent",
      )
    }
    await googleAdsSettingsRepository.upsertSettings({
      workspaceId,
      settings: { version: 1, consent: parsed.data },
    })
    return parsed.data
  }
}

export const googleAdsSettingsService = new GoogleAdsSettingsService()
