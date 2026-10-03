import {
  type AiHandoverChannel,
  aiHandoverTimeRangesSchema,
  inboxStatuses,
  parseAiHandoverChannel,
} from "@chatbotx.io/database/partials"
import {
  type AiHandoverSettingsInboxRef,
  aiHandoverSettingsRepository,
  type UpsertAiHandoverSettingsInput,
} from "@chatbotx.io/database/repositories"
import type {
  AiHandoverSettingsModel,
  InboxModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { AI_HANDOVER_CHANNEL_POLICIES } from "@chatbotx.io/utils/channel"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { flowService } from "../flow/service"
import { inboxService } from "../inbox/service"
import { logger } from "../logger"
import { workspaceService } from "../workspace/service"
import { aiHandoverSettingsCacheTag } from "./cache-tag"
import { isAiHandoverActive } from "./policy"

/**
 * Bounds how long a stale read can outlive a failed tag invalidation. The
 * worker reads this on the inbound path and at every bulk batch, so it is
 * cached, but a changed setting must reach it quickly even if invalidation is
 * best-effort.
 */
const SETTINGS_CACHE_TTL_SECONDS = 5 * 60

// One key per Page: the cache holds at most one small row for each Page that
// ever read its settings, and Redis expires it. The key carries the workspace
// too (the read is scoped by it, so a foreign id must never share an entry with
// the owner); the tag is the Page alone, so one invalidation clears it.
const settingsCacheKey = (input: AiHandoverSettingsInboxRef) =>
  `ai-handover-settings:${input.workspaceId}:${input.inboxId}`

/** What the cache holds: the settings, wrapped because `withCache` skips null. */
type CachedSettings = { settings: AiHandoverSettingsModel | null }

export type SaveAiHandoverSettingsInput = Omit<
  UpsertAiHandoverSettingsInput,
  "gotoFlowId" | "returnMessage" | "channel"
> & {
  gotoFlowId: string | null
  returnMessage: string | null
}

/** A Page of a workspace whose channel has an AI hand-over, with that channel. */
export type AiHandoverInbox = Pick<InboxModel, "id" | "status"> & {
  channel: AiHandoverChannel
}

class AiHandoverSettingsService extends BaseService {
  /**
   * The Page's inbox when it belongs to the workspace and its channel has an AI
   * hand-over (`AI_HANDOVER_CHANNEL_POLICIES`); otherwise "not found", so a foreign or
   * unsupported id never resolves.
   */
  async requireInbox(
    input: AiHandoverSettingsInboxRef,
  ): Promise<AiHandoverInbox> {
    const inbox = await inboxService.find({
      where: { id: input.inboxId, workspaceId: input.workspaceId },
    })
    const channel = inbox ? parseAiHandoverChannel(inbox.channel) : null
    if (!(inbox && channel)) {
      throw notFoundException("Inbox not found")
    }
    return { id: inbox.id, status: inbox.status, channel }
  }

  /**
   * The Page's settings. `withCache` never stores a null/undefined result, so
   * the value is wrapped: a Page that never configured this would otherwise hit
   * the database on every inbound message and every bulk batch. The Page's
   * connection state is deliberately NOT cached (`isPageConnected`): it changes
   * inside the connect/disconnect transaction of every channel, where an
   * invalidation cannot be ordered after the commit.
   */
  private load(input: AiHandoverSettingsInboxRef): Promise<CachedSettings> {
    return withCache(
      settingsCacheKey(input),
      async (): Promise<CachedSettings> => ({
        settings: await aiHandoverSettingsRepository.findByInbox(input),
      }),
      {
        ttl: SETTINGS_CACHE_TTL_SECONDS,
        tags: [aiHandoverSettingsCacheTag(input.inboxId)],
      },
    )
  }

  /**
   * The Page's settings, or `null` when none were saved (no automation, as in
   * v1).
   */
  async find(
    input: AiHandoverSettingsInboxRef,
  ): Promise<AiHandoverSettingsModel | null> {
    return (await this.load(input)).settings
  }

  /** Whether the Page's inbox is connected (always a fresh, primary-key read). */
  private async isPageConnected(
    input: AiHandoverSettingsInboxRef,
  ): Promise<boolean> {
    const inbox = await inboxService.find({
      where: { id: input.inboxId, workspaceId: input.workspaceId },
    })
    return inbox?.status === inboxStatuses.enum.connected
  }

  /** Drops the Page's cached settings (after any write to them). */
  invalidate(input: { inboxId: string }): Promise<void> {
    return this.invalidateCacheTags(aiHandoverSettingsCacheTag(input.inboxId))
  }

  /**
   * Whether `settings` apply right now. The workspace timezone is loaded only
   * when a schedule needs it.
   */
  async isActiveNow(
    settings: AiHandoverSettingsModel,
    now: Date = new Date(),
  ): Promise<boolean> {
    const timeZone = settings.scheduleEnabled
      ? ((await workspaceService.find({ where: { id: settings.workspaceId } }))
          ?.timezone ?? "UTC")
      : "UTC"
    return isAiHandoverActive(settings, timeZone, now)
  }

  /**
   * The Page's settings when the AI hand-off automation applies right now
   * (saved, switched on, inside its schedule, and the Page still connected),
   * else `null`. The settings are cached; the connection state is read fresh.
   */
  async findActive(
    input: AiHandoverSettingsInboxRef & { now?: Date },
  ): Promise<AiHandoverSettingsModel | null> {
    const { settings } = await this.load(input)
    if (!(settings && (await this.isActiveNow(settings, input.now)))) {
      return null
    }
    return (await this.isPageConnected(input)) ? settings : null
  }

  /**
   * Why a bulk run on this Page must stop although nothing went wrong in it:
   * its Page was disconnected, or (for a hand-over, `requiresAutomation`) its
   * automation is no longer running. `null` = carry on. A cached settings read and
   * a primary-key read, so the engine can ask before every batch.
   */
  async findStopReason(
    input: AiHandoverSettingsInboxRef & {
      requiresAutomation: boolean
      now?: Date
    },
  ): Promise<"pageDisconnected" | "automationStopped" | null> {
    if (!(await this.isPageConnected(input))) {
      return "pageDisconnected"
    }
    const { settings } = await this.load(input)
    if (
      input.requiresAutomation &&
      !(settings && (await this.isActiveNow(settings, input.now)))
    ) {
      return "automationStopped"
    }
    return null
  }

  /**
   * Whether the Page configured the AI hand-off but it is NOT running right now
   * (switched off, or outside its schedule). That is when a thread the AI holds
   * is taken back. Nothing saved is `false`: there is no automation to take
   * over for.
   */
  async isConfiguredAndInactive(
    input: AiHandoverSettingsInboxRef & { now?: Date },
  ): Promise<boolean> {
    const settings = await this.find(input)
    return settings !== null && !(await this.isActiveNow(settings, input.now))
  }

  /**
   * Creates or replaces the Page's settings. The goto flow must be an active
   * flow of this workspace; a schedule needs at least one window; the return
   * message is trimmed and bounded.
   */
  async save(
    input: SaveAiHandoverSettingsInput,
  ): Promise<AiHandoverSettingsModel> {
    const { workspaceId, inboxId, gotoFlowId } = input
    const inbox = await this.requireInbox({ workspaceId, inboxId })
    const timeRanges = aiHandoverTimeRangesSchema.safeParse(input.timeRanges)
    if (!timeRanges.success) {
      throw validationException("timeRanges", "Invalid time ranges")
    }
    if (input.scheduleEnabled && timeRanges.data.length === 0) {
      throw validationException("timeRanges", "Add at least one time range")
    }

    const returnMessage = input.returnMessage?.trim() || null
    const maxLength =
      AI_HANDOVER_CHANNEL_POLICIES[inbox.channel].messageMaxLength
    if (returnMessage && returnMessage.length > maxLength) {
      throw validationException("returnMessage", "Return message is too long", {
        max: maxLength,
      })
    }

    if (gotoFlowId) {
      const flow = await flowService.findActiveById({
        id: gotoFlowId,
        workspaceId,
      })
      if (!flow) {
        throw notFoundException("Flow not found")
      }
    }

    const row = await aiHandoverSettingsRepository.upsert({
      ...input,
      channel: inbox.channel,
      timeRanges: timeRanges.data,
      returnMessage,
    })
    // The row is committed: a cache outage must not fail the save (callers
    // act on it, e.g. stopping a running enable), and the entry expires anyway.
    try {
      await this.invalidate({ inboxId })
    } catch (err) {
      logger.warn(
        { err, inboxId },
        "AI hand-over settings cache invalidation failed",
      )
    }
    return row
  }
}

export const aiHandoverSettingsService = new AiHandoverSettingsService()
