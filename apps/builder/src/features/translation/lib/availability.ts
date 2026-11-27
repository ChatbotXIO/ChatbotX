import {
  resolveTranslationModel,
  TranslationIntegrationUnavailableError,
} from "@chatbotx.io/ai/translation"
import {
  inboxTranslationSettingsService,
  isTranslationEffective,
  workspaceService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import type {
  ConversationModel,
  InboxTranslationSettingsModel,
} from "@chatbotx.io/database/types"
import type {
  ConversationTranslationStateResource,
  TranslationSettingsResource,
} from "../schema/resource"

type ConversationTranslation = NonNullable<
  ConversationModel["additionalAttributes"]
>["translation"]

export const conversationTranslation = (
  conversation: Pick<ConversationModel, "additionalAttributes">,
): ConversationTranslation => conversation.additionalAttributes?.translation

export const loadTranslationContext = async (workspaceId: string) => {
  const [settings, workspace] = await Promise.all([
    inboxTranslationSettingsService.get(workspaceId),
    workspaceService.find({ where: { id: workspaceId } }),
  ])
  if (!workspace) {
    throw notFoundException("Workspace not found")
  }
  return { settings, workspaceLanguage: workspace.language }
}

/** Whether translation applies to this conversation right now (workspace, override). */
export const isTranslationEffectiveFor = (
  settings: Pick<InboxTranslationSettingsModel, "enabled"> | null,
  conversation: Pick<ConversationModel, "additionalAttributes">,
): boolean =>
  isTranslationEffective({
    workspaceEnabled: settings?.enabled === true,
    enabledOverride: conversationTranslation(conversation)?.enabledOverride,
  })

/** `true` when the configured integration can be resolved right now. */
export async function isModelAvailable(
  workspaceId: string,
  settings: Pick<InboxTranslationSettingsModel, "modelConfig"> | null,
): Promise<boolean> {
  if (!settings?.modelConfig) {
    return false
  }
  try {
    await resolveTranslationModel({
      workspaceId,
      modelConfig: settings.modelConfig,
    })
    return true
  } catch (error) {
    if (error instanceof TranslationIntegrationUnavailableError) {
      return false
    }
    throw error
  }
}

export async function toSettingsResource(
  workspaceId: string,
): Promise<TranslationSettingsResource> {
  const { settings, workspaceLanguage } =
    await loadTranslationContext(workspaceId)
  const enabled = settings?.enabled === true
  const modelConfig = settings?.modelConfig ?? null
  const available = await isModelAvailable(workspaceId, settings)

  let status: TranslationSettingsResource["status"] = "disabled"
  if (enabled) {
    status = available ? "active" : "needsReconfiguration"
  }

  return {
    enabled,
    status,
    workspaceLanguage,
    modelConfig,
    integration: modelConfig
      ? {
          available,
          label:
            "kind" in modelConfig ? "openaiCompatible" : modelConfig.provider,
        }
      : null,
    enabledAt: settings?.enabledAt ?? null,
  }
}

export function toConversationStateResource(
  settings: Pick<InboxTranslationSettingsModel, "enabled"> | null,
  conversation: Pick<ConversationModel, "additionalAttributes">,
): ConversationTranslationStateResource {
  const state = conversationTranslation(conversation)
  return {
    enabledOverride: state?.enabledOverride ?? null,
    effectiveEnabled: isTranslationEffectiveFor(settings, conversation),
    language: state?.language ?? null,
    languageSource: state?.languageSource ?? null,
  }
}
