import { aiChatProviders } from "@chatbotx.io/ai"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { buildOpenaiCompatibleIntegrationOptions } from "@/features/integration-openai-compatible/model-options"
import type { IntegrationOpenaiCompatibleResource } from "@/features/integration-openai-compatible/schema/resource"
import type { AiModelChoice } from "./model-choice"

export type AiProviderOption = { label: string; provider: string }

/** One entry per usable AI integration: its request `integrationId`, label and default model. */
export type AiIntegrationOption = SelectOption & { defaultModel: string }

const STORAGE_PREFIX = "composer-ai-model:"

export const buildAiIntegrationOptions = (props: {
  openaiCompatible: IntegrationOpenaiCompatibleResource[]
  providers: AiProviderOption[]
}): AiIntegrationOption[] => {
  const builtIn = props.providers.map((entry) => ({
    defaultModel:
      aiChatProviders.find((candidate) => candidate.provider === entry.provider)
        ?.defaultModel ?? "",
    label: entry.label,
    value: entry.provider,
  }))
  const compatible = buildOpenaiCompatibleIntegrationOptions({
    integrations: props.openaiCompatible,
  }).map((option) => ({
    ...option,
    defaultModel:
      props.openaiCompatible.find((entry) => entry.id === option.value)
        ?.defaultModel ?? "",
  }))
  return [...builtIn, ...compatible]
}

export const readStoredChoice = (workspaceId: string): AiModelChoice | null => {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (
      parsed &&
      typeof parsed === "object" &&
      "integrationId" in parsed &&
      "model" in parsed &&
      typeof parsed.integrationId === "string" &&
      typeof parsed.model === "string" &&
      parsed.integrationId &&
      parsed.model
    ) {
      return { integrationId: parsed.integrationId, model: parsed.model }
    }
  } catch {
    // Storage unavailable or corrupt: the picker starts empty.
  }
  return null
}

export const writeStoredChoice = (
  workspaceId: string,
  choice: AiModelChoice,
): void => {
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${workspaceId}`,
      JSON.stringify(choice),
    )
  } catch {
    // Storage unavailable: the choice just is not remembered.
  }
}

/**
 * The choice the picker starts with: the one the caller already holds (a saved
 * feed's model) while that integration still exists, else the remembered one
 * under the same condition, else the only integration with its default model,
 * else none.
 */
export const defaultAiChoice = (
  options: readonly AiIntegrationOption[],
  stored: AiModelChoice | null,
  current: AiModelChoice | null = null,
): AiModelChoice | null => {
  if (
    current &&
    options.some((option) => option.value === current.integrationId)
  ) {
    return current
  }
  const remembered = options.find(
    (option) => option.value === stored?.integrationId,
  )
  if (stored && remembered) {
    return stored
  }
  const [only] = options
  if (options.length === 1 && only?.defaultModel) {
    return { integrationId: only.value, model: only.defaultModel }
  }
  return null
}

/**
 * The choice after the integrations list is read again (after the first start):
 * the current pick stays while its integration exists; once it is gone (or
 * nothing is picked) the usual start applies.
 */
export const choiceAfterRefetch = (
  options: readonly AiIntegrationOption[],
  stored: AiModelChoice | null,
  current: AiModelChoice | null,
): AiModelChoice | null =>
  current && options.some((option) => option.value === current.integrationId)
    ? current
    : defaultAiChoice(options, stored)
