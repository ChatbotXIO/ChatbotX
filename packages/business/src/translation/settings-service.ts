import {
  type AIAgentModelConfig,
  aiAgentModelConfig,
} from "@chatbotx.io/database/partials"
import { inboxTranslationSettingsRepository } from "@chatbotx.io/database/repositories"
import type { InboxTranslationSettingsModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { validationException } from "../errors"

/** Bounds how long a stale read outlives a failed tag invalidation. */
const SETTINGS_CACHE_TTL_SECONDS = 5 * 60

const settingsCacheKey = (workspaceId: string) =>
  `inbox-translation-settings:${workspaceId}`

const settingsCacheTag = (workspaceId: string) =>
  `inbox-translation-settings:${workspaceId}`

/** What the cache holds: wrapped because `withCache` skips null. */
type CachedSettings = { settings: InboxTranslationSettingsModel | null }

export type UpdateInboxTranslationSettingsInput = {
  workspaceId: string
  enabled: boolean
  modelConfig: AIAgentModelConfig | null
}

/**
 * Workspace-level Inbox translation settings. Reads are cached: the inbox
 * reads them on every conversation open and the API on every `messages.list`,
 * and a workspace that never used the feature must not cost a query each time.
 *
 * This validates only the *shape* of `modelConfig`. Whether the integration it
 * names is usable needs the provider layer (`@chatbotx.io/ai`, which depends
 * on this package), so the builder action calls `resolveTranslationModel`
 * before saving.
 */
class InboxTranslationSettingsService extends BaseService {
  private load(workspaceId: string): Promise<CachedSettings> {
    return withCache(
      settingsCacheKey(workspaceId),
      async (): Promise<CachedSettings> => ({
        settings:
          await inboxTranslationSettingsRepository.findByWorkspaceId(
            workspaceId,
          ),
      }),
      {
        ttl: SETTINGS_CACHE_TTL_SECONDS,
        tags: [settingsCacheTag(workspaceId)],
      },
    )
  }

  /** The workspace's settings, or `null` when it never saved any. */
  async get(
    workspaceId: string,
  ): Promise<InboxTranslationSettingsModel | null> {
    return (await this.load(workspaceId)).settings
  }

  /**
   * Whether translation was ever switched on (`enabledAt` is never
   * cleared). Edit/unsend handlers use it to skip any
   * work for a workspace that never used the feature; one that switched it off
   * again still counts, or turning it back on would show a translation of
   * content the customer has since changed.
   */
  async hasEverBeenEnabled(workspaceId: string): Promise<boolean> {
    return (await this.get(workspaceId))?.enabledAt != null
  }

  async update(
    input: UpdateInboxTranslationSettingsInput,
  ): Promise<InboxTranslationSettingsModel> {
    const { workspaceId, enabled } = input
    let modelConfig: AIAgentModelConfig | null = null
    if (input.modelConfig !== null) {
      const parsed = aiAgentModelConfig.safeParse(input.modelConfig)
      if (!parsed.success) {
        throw validationException("modelConfig", "Invalid AI model selection")
      }
      modelConfig = parsed.data
    }
    if (enabled && modelConfig === null) {
      throw validationException(
        "modelConfig",
        "Choose an AI integration and model before enabling translation",
      )
    }

    const saved = await inboxTranslationSettingsRepository.upsert({
      workspaceId,
      enabled,
      modelConfig,
    })
    await this.invalidate(workspaceId)
    return saved
  }

  invalidate(workspaceId: string): Promise<void> {
    return this.invalidateCacheTags(settingsCacheTag(workspaceId))
  }
}

export const inboxTranslationSettingsService =
  new InboxTranslationSettingsService()
