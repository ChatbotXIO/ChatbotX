import {
  resolveTranslationModel,
  TranslationIntegrationUnavailableError,
} from "@chatbotx.io/ai/translation"
import { inboxTranslationSettingsService } from "@chatbotx.io/business"
import type { UpdateTranslationSettingsRequest } from "../schema/action"
import type { TranslationSettingsResource } from "../schema/resource"
import { toSettingsResource } from "./availability"
import { translationException } from "./errors"

/**
 * Saves the workspace's Inbox translation settings. `business` validates the
 * shape of `modelConfig`; whether the integration it names works needs the
 * provider layer, so it is resolved here before anything is stored: an admin
 * never saves a model that cannot translate.
 */
export async function updateTranslationSettings(props: {
  workspaceId: string
  request: UpdateTranslationSettingsRequest
}): Promise<TranslationSettingsResource> {
  const { workspaceId, request } = props
  if (request.enabled && request.modelConfig === null) {
    throw translationException("notConfigured")
  }
  if (request.enabled && request.modelConfig !== null) {
    try {
      await resolveTranslationModel({
        workspaceId,
        modelConfig: request.modelConfig,
      })
    } catch (error) {
      if (error instanceof TranslationIntegrationUnavailableError) {
        throw translationException("integrationUnavailable")
      }
      throw error
    }
  }

  await inboxTranslationSettingsService.update({
    workspaceId,
    enabled: request.enabled,
    modelConfig: request.modelConfig,
  })
  return await toSettingsResource(workspaceId)
}
