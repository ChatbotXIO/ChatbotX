import { db } from "@chatbotx.io/database/client"
import type {
  ChannelType,
  LeaderboardPlatform,
  LeaderboardRewardSettings,
  LeaderboardRules,
  LeaderboardScope,
  LeaderboardStatus,
} from "@chatbotx.io/database/partials"
import {
  fileRepository,
  leaderboardAuditLogRepository,
  leaderboardParticipantRepository,
  leaderboardRepository,
} from "@chatbotx.io/database/repositories"
import type { LeaderboardModel } from "@chatbotx.io/database/types"
import {
  DefaultJobAction,
  defaultQueue,
  LeaderboardJobAction,
  leaderboardQueue,
} from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import {
  ChatbotXException,
  notFoundException,
  validationException,
} from "../errors"
import { flowService } from "../flow"
import { flowVersionService } from "../flow-version"
import { assertReferencable } from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
import { assertValidLeaderboardConfig, defaultLeaderboardRules } from "./config"
import { purgeLeaderboardDataForWorkspace } from "./purge"
import { leaderboardRankingService } from "./ranking"
import {
  LEADERBOARD_LATE_EVENT_GRACE_MS,
  leaderboardInboxCacheTag,
  leaderboardMinigameCacheTag,
} from "./scoring"
import {
  buildLeaderboardWelcomeNode,
  LEADERBOARD_WELCOME_TEXT,
} from "./welcome-flow"

export type LeaderboardUpsertInput = {
  name: string
  description: string
  coverImageUrl: string
  startsAt: Date
  endsAt: Date
  platform: LeaderboardPlatform
  inboxId: string | null
  minigameId: string | null
  scope: LeaderboardScope
  rules: LeaderboardRules
  followersOnly: boolean
  tagIds: string[]
  resetTime: string
  cooldownSeconds: number
  referralWelcomeFlowId: string | null
  rewardSettings: LeaderboardRewardSettings
}

/** Which inbox channel hosts each platform. */
export const LEADERBOARD_PLATFORM_CHANNEL: Record<
  Exclude<LeaderboardPlatform, "gamification">,
  ChannelType
> = {
  messenger: "messenger",
  instagram: "instagram",
  whatsapp: "whatsapp",
  zalo: "zalo",
  telegram: "telegram",
  tiktok: "tiktok",
  threads: "threads",
  email: "smtp",
}

/** Allowed actions per status — mirrors the spec's status table. */
export const LEADERBOARD_ACTIONS_BY_STATUS: Record<
  LeaderboardStatus,
  readonly (
    | "edit"
    | "publish"
    | "pause"
    | "start"
    | "finish"
    | "resetPoints"
    | "export"
    | "triggerRewards"
    | "delete"
  )[]
> = {
  draft: ["edit", "publish", "delete"],
  active: ["pause", "edit", "resetPoints", "finish", "export"],
  paused: ["start", "edit", "export", "delete"],
  finished: ["export", "triggerRewards", "delete"],
}

type LeaderboardAction =
  (typeof LEADERBOARD_ACTIONS_BY_STATUS)[LeaderboardStatus][number]

const assertActionAllowed = (
  leaderboard: Pick<LeaderboardModel, "status">,
  action: LeaderboardAction,
) => {
  if (!LEADERBOARD_ACTIONS_BY_STATUS[leaderboard.status].includes(action)) {
    throw new ChatbotXException(
      `Cannot ${action} a ${leaderboard.status} leaderboard`,
      "leaderboardActionNotAllowed",
      409,
    )
  }
}

const sanitizeTagIds = (tagIds: string[]) => Array.from(new Set(tagIds))

class LeaderboardService extends BaseService {
  private cacheTagsFor(
    ...leaderboards: (Pick<LeaderboardModel, "inboxId" | "minigameId"> | null)[]
  ): string[] {
    const tags = new Set<string>()
    for (const leaderboard of leaderboards) {
      if (leaderboard?.inboxId) {
        tags.add(leaderboardInboxCacheTag(leaderboard.inboxId))
      }
      if (leaderboard?.minigameId) {
        tags.add(leaderboardMinigameCacheTag(leaderboard.minigameId))
      }
    }
    return [...tags]
  }

  private async invalidateLive(
    ...leaderboards: (Pick<LeaderboardModel, "inboxId" | "minigameId"> | null)[]
  ) {
    const tags = this.cacheTagsFor(...leaderboards)
    if (tags.length > 0) {
      await this.invalidateCacheTags(tags)
    }
  }

  async list(input: {
    workspaceId: string
    status?: LeaderboardStatus | null
    platform?: LeaderboardPlatform | null
    keyword?: string | null
    page?: number
    perPage?: number
  }) {
    const page = input.page ?? 1
    const perPage = input.perPage ?? 20
    const filter = {
      workspaceId: input.workspaceId,
      status: input.status ?? null,
      platform: input.platform ?? null,
      keyword: input.keyword ?? null,
    }
    const [rows, total, counts] = await Promise.all([
      leaderboardRepository.listPaginated({ ...filter, page, perPage }),
      leaderboardRepository.count(filter),
      leaderboardRepository.countByStatus(input.workspaceId),
    ])
    const stats = await leaderboardRankingService.statsMany(rows)
    return {
      data: rows.map((row) => ({
        ...row,
        stats: stats.get(row.id) ?? {
          participants: 0,
          totalPoints: 0,
          newToday: 0,
        },
      })),
      total,
      pageCount: Math.ceil(total / perPage),
      summary: {
        total: Object.values(counts).reduce((sum, value) => sum + value, 0),
        active: counts.active ?? 0,
        paused: counts.paused ?? 0,
        finished: counts.finished ?? 0,
        draft: counts.draft ?? 0,
      },
    }
  }

  async find(input: { workspaceId: string; id: string }) {
    const row = await leaderboardRepository.findByIdAndWorkspace(input)
    if (!row) {
      throw notFoundException("Leaderboard not found")
    }
    const stats = await leaderboardRankingService.statsMany([row])
    return { ...row, stats: stats.get(row.id) }
  }

  /** Unscoped lookup for the public view page/token, which carries no session. */
  async findUnscoped(id: string): Promise<LeaderboardModel | null> {
    return (await leaderboardRepository.findById(id)) ?? null
  }

  /** Verifies the host channel / minigame / flows / tags belong to the workspace. */
  private async assertReferences(
    workspaceId: string,
    input: LeaderboardUpsertInput,
  ) {
    if (input.platform === "gamification") {
      const minigame = input.minigameId
        ? await db.query.minigameModel.findFirst({
            where: { id: input.minigameId, workspaceId },
            columns: { id: true },
          })
        : null
      if (!minigame) {
        throw validationException("minigameId", "Minigame not found")
      }
    } else {
      const inbox = input.inboxId
        ? await db.query.inboxModel.findFirst({
            where: { id: input.inboxId, workspaceId },
            columns: { id: true, channel: true },
          })
        : null
      if (
        !inbox ||
        inbox.channel !== LEADERBOARD_PLATFORM_CHANNEL[input.platform]
      ) {
        throw validationException(
          "inboxId",
          `Choose a connected ${input.platform} channel`,
        )
      }
    }
    for (const [field, flowId] of [
      ["referralWelcomeFlowId", input.referralWelcomeFlowId],
      ["rewardSettings.flowId", input.rewardSettings.flowId],
    ] as const) {
      if (!flowId) {
        continue
      }
      const flow = await db.query.flowModel.findFirst({
        where: { id: flowId, workspaceId },
        columns: { id: true },
      })
      if (!flow) {
        throw validationException(field, "Flow not found")
      }
    }
    if (input.tagIds.length > 0) {
      const tags = await db.query.tagModel.findMany({
        where: { id: { in: input.tagIds }, workspaceId },
        columns: { id: true },
      })
      if (tags.length !== new Set(input.tagIds).size) {
        throw validationException("tagIds", "Tag not found")
      }
    }
  }

  private toColumns(input: LeaderboardUpsertInput) {
    const isGamification = input.platform === "gamification"
    return {
      name: input.name.trim(),
      description: input.description,
      coverImageUrl: input.coverImageUrl,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      platform: input.platform,
      inboxId: isGamification ? null : input.inboxId,
      minigameId: isGamification ? input.minigameId : null,
      scope: input.scope,
      rules: input.rules,
      followersOnly: input.followersOnly,
      tagIds: sanitizeTagIds(input.tagIds),
      resetTime: input.resetTime,
      cooldownSeconds: input.cooldownSeconds,
      referralWelcomeFlowId: input.referralWelcomeFlowId,
      rewardSettings: input.rewardSettings,
    }
  }

  /**
   * Creates a draft. When referral is on and no welcome flow was chosen, a
   * published welcome flow is created alongside (spec: "the admin only edits
   * one text block") — `buildViewUrl` comes from the app so the flow's button
   * links to exactly the URL the builder shows.
   */
  async create(
    input: { workspaceId: string } & LeaderboardUpsertInput,
    options: { buildViewUrl?: (leaderboardId: string) => string } = {},
  ) {
    const columns = this.toColumns(input)
    assertValidLeaderboardConfig(columns)
    await this.assertReferences(input.workspaceId, input)
    const wantsWelcomeFlow =
      !columns.referralWelcomeFlowId &&
      Boolean(columns.rules.referral?.enabled) &&
      columns.platform !== "email" &&
      Boolean(options.buildViewUrl)

    const row = await withTemplateLockedTransaction(async (tx) => {
      // The welcome flow's tpl-res lock is held until the reference commits.
      if (columns.referralWelcomeFlowId) {
        await assertReferencable({
          workspaceId: input.workspaceId,
          parents: [
            { kind: "flow", resourceId: columns.referralWelcomeFlowId },
          ],
          tx,
        })
      }
      const inserted = await leaderboardRepository.insert(
        { workspaceId: input.workspaceId, status: "draft", ...columns },
        tx,
      )
      if (!(wantsWelcomeFlow && options.buildViewUrl)) {
        return inserted
      }
      const node = buildLeaderboardWelcomeNode({
        text: LEADERBOARD_WELCOME_TEXT,
        buttonLabel: "View leaderboard",
        viewUrl: options.buildViewUrl(inserted.id),
      })
      const { flowId } = await flowService.createPublishedDefault(tx, {
        workspaceId: input.workspaceId,
        name: `Leaderboard welcome - ${inserted.name}`,
        startNodeId: node.id,
        nodes: [node],
        edges: [],
      })
      return (
        (await leaderboardRepository.update(
          { id: inserted.id, workspaceId: input.workspaceId },
          { referralWelcomeFlowId: flowId },
          tx,
        )) ?? inserted
      )
    })
    if (row.referralWelcomeFlowId && wantsWelcomeFlow) {
      await flowVersionService.invalidateList(row.referralWelcomeFlowId)
    }
    await this.audit("leaderboard.create", `Created leaderboard ${row.id}`)
    return row
  }

  /** Default rules for a platform, used by the create wizard and API callers. */
  defaultRules(platform: LeaderboardPlatform): LeaderboardRules {
    return defaultLeaderboardRules(platform)
  }

  async update(
    input: { workspaceId: string; id: string } & LeaderboardUpsertInput,
  ) {
    const current = await leaderboardRepository.findByIdAndWorkspace(input)
    if (!current) {
      throw notFoundException("Leaderboard not found")
    }
    assertActionAllowed(current, "edit")
    const columns = this.toColumns(input)
    if (
      current.status !== "draft" &&
      (columns.platform !== current.platform ||
        columns.inboxId !== current.inboxId ||
        columns.minigameId !== current.minigameId)
    ) {
      throw validationException(
        "platform",
        "The platform and channel cannot change after publishing",
      )
    }
    if (
      current.status !== "draft" &&
      columns.startsAt.getTime() !== current.startsAt.getTime()
    ) {
      // The Redis tie-break is encoded relative to `startsAt`.
      throw validationException(
        "startsAt",
        "The start time cannot change after publishing",
      )
    }
    assertValidLeaderboardConfig(columns)
    await this.assertReferences(input.workspaceId, input)
    const row = await withTemplateLockedTransaction(async (tx) => {
      // The welcome flow's tpl-res lock is held until the reference commits.
      if (columns.referralWelcomeFlowId) {
        await assertReferencable({
          workspaceId: input.workspaceId,
          parents: [
            { kind: "flow", resourceId: columns.referralWelcomeFlowId },
          ],
          tx,
        })
      }
      return await leaderboardRepository.update(input, columns, tx)
    })
    if (!row) {
      throw notFoundException("Leaderboard not found")
    }
    await this.invalidateLive(current, row)
    await this.audit("leaderboard.update", `Updated leaderboard ${row.id}`)
    return row
  }

  private async transition(
    input: { workspaceId: string; id: string },
    action: LeaderboardAction,
    next: Partial<Pick<LeaderboardModel, "status" | "finishedAt">>,
  ) {
    const current = await leaderboardRepository.findByIdAndWorkspace(input)
    if (!current) {
      throw notFoundException("Leaderboard not found")
    }
    assertActionAllowed(current, action)
    const row = await leaderboardRepository.transitionStatus(
      { ...input, from: current.status },
      next,
    )
    if (!row) {
      // Another transition (e.g. the finish cron) won the race.
      throw new ChatbotXException(
        "The leaderboard status changed meanwhile; reload and try again",
        "leaderboardActionNotAllowed",
        409,
      )
    }
    await this.invalidateLive(row)
    await this.audit(
      `leaderboard.${action}`,
      `Leaderboard ${row.id} → ${row.status}`,
    )
    return row
  }

  async publish(input: { workspaceId: string; id: string }) {
    const current = await leaderboardRepository.findByIdAndWorkspace(input)
    if (!current) {
      throw notFoundException("Leaderboard not found")
    }
    if (!Object.values(current.rules).some((rule) => rule?.enabled)) {
      throw validationException("rules", "Enable at least one scoring rule")
    }
    if (current.endsAt.getTime() <= Date.now()) {
      throw validationException("endsAt", "The end time has already passed")
    }
    const row = await this.transition(input, "publish", { status: "active" })
    await leaderboardRankingService.rebuild(row)
    return row
  }

  async pause(input: { workspaceId: string; id: string }) {
    return await this.transition(input, "pause", { status: "paused" })
  }

  async start(input: { workspaceId: string; id: string }) {
    return await this.transition(input, "start", { status: "active" })
  }

  /**
   * Closes the campaign: Redis is released and, after the late-event grace
   * (events from before the end still queued), automatic rewards go out.
   * Sending rewards is what freezes the scores for good.
   */
  async finish(input: { workspaceId: string; id: string }) {
    const row = await this.transition(input, "finish", {
      status: "finished",
      finishedAt: new Date(),
    })
    await leaderboardRankingService.drop(row.id)
    if (row.rewardSettings.autoOnFinish && row.rewardSettings.flowId) {
      await leaderboardQueue.add(
        LeaderboardJobAction.triggerRewards,
        {
          type: LeaderboardJobAction.triggerRewards,
          data: { workspaceId: row.workspaceId, leaderboardId: row.id },
        },
        {
          jobId: `lb-rewards-${row.id}`,
          delay: LEADERBOARD_LATE_EVENT_GRACE_MS,
        },
      )
    }
    return row
  }

  /** Closes every active/paused leaderboard past its end time (cron). */
  async finishOverdue(now: Date = new Date()) {
    const overdue = await leaderboardRepository.findOverdue(now)
    let finished = 0
    for (const leaderboard of overdue) {
      try {
        await this.finish({
          workspaceId: leaderboard.workspaceId,
          id: leaderboard.id,
        })
        finished += 1
      } catch (err) {
        if (
          !(
            err instanceof ChatbotXException &&
            err.code === "leaderboardActionNotAllowed"
          )
        ) {
          throw err
        }
      }
    }
    return { finished }
  }

  /** Sets every score to 0 (danger action, Active only). */
  async resetPoints(input: {
    workspaceId: string
    id: string
    actorUserId: string | null
    reason?: string
  }) {
    const current = await leaderboardRepository.findByIdAndWorkspace(input)
    if (!current) {
      throw notFoundException("Leaderboard not found")
    }
    assertActionAllowed(current, "resetPoints")
    const reset = await db.transaction(async (tx) => {
      const count = await leaderboardParticipantRepository.resetAll(
        current.id,
        tx,
      )
      await leaderboardAuditLogRepository.insert(
        {
          leaderboardId: current.id,
          workspaceId: current.workspaceId,
          contactId: null,
          action: "resetAll",
          delta: 0,
          actorUserId: input.actorUserId,
          reason: input.reason?.trim() ?? "",
        },
        tx,
      )
      return count
    })
    await leaderboardRankingService.drop(current.id)
    await leaderboardRankingService.rebuild(current)
    await this.audit(
      "leaderboard.resetPoints",
      `Reset ${reset} scores of leaderboard ${current.id}`,
    )
    return { reset }
  }

  async delete(input: { workspaceId: string; id: string }) {
    const current = await leaderboardRepository.findByIdAndWorkspace(input)
    if (!current) {
      throw notFoundException("Leaderboard not found")
    }
    assertActionAllowed(current, "delete")
    await leaderboardRepository.update(input, { deletedAt: new Date() })
    await leaderboardRankingService.drop(current.id)
    await this.invalidateLive(current)
    await this.audit("leaderboard.delete", `Deleted leaderboard ${current.id}`)
    return { id: current.id }
  }

  /**
   * Workspace hard-delete: participants/audit rows cascade with the
   * Leaderboard rows, but the partitioned score history has no FKs and is
   * removed explicitly; Redis keys are dropped too.
   */
  async purgeByWorkspace(
    workspaceId: string,
    options: { batchSize?: number; maxBatches?: number } = {},
  ) {
    return await purgeLeaderboardDataForWorkspace(workspaceId, options)
  }

  /** Queues a CSV export of the participants; returns the pending File row. */
  /**
   * `includeContactInfo` adds phone/email columns; the app layer sets it
   * from the member's `emailAndPhone` permission (or the token's `contacts`
   * scope), never from request input.
   */
  async createExport(input: {
    workspaceId: string
    id: string
    userId: string | null
    includeContactInfo: boolean
  }) {
    const leaderboard = await leaderboardRepository.findByIdAndWorkspace(input)
    if (!leaderboard) {
      throw notFoundException("Leaderboard not found")
    }
    assertActionAllowed(leaderboard, "export")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const fileName = `leaderboard-${leaderboard.id}-${timestamp}.csv`
    const path = `workspaces/${input.workspaceId}/exports/${fileName}`
    const file = await leaderboardRepository.createExportFile({
      workspaceId: input.workspaceId,
      userId: input.userId,
      fileName,
      path,
    })
    await defaultQueue.add(DefaultJobAction.exportLeaderboardParticipants, {
      type: DefaultJobAction.exportLeaderboardParticipants,
      data: {
        workspaceId: input.workspaceId,
        leaderboardId: leaderboard.id,
        fileId: file.id,
        outputPath: path,
        includeContactInfo: input.includeContactInfo,
      },
    })
    return { fileId: file.id, fileName, status: file.status }
  }

  /** One CSV page (rank order, banned last) for the export job. */
  async exportPage(input: {
    leaderboardId: string
    limit: number
    offset: number
  }) {
    return await leaderboardParticipantRepository.exportPage(input)
  }

  async updateExportFile(input: {
    workspaceId: string
    fileId: string
    values: Parameters<typeof fileRepository.updateForWorkspace>[0]["values"]
  }) {
    await fileRepository.updateForWorkspace({
      id: input.fileId,
      workspaceId: input.workspaceId,
      values: input.values,
    })
  }

  async getExport(input: { workspaceId: string; fileId: string }) {
    const file = await leaderboardRepository.findExportFile(input)
    if (!file) {
      throw notFoundException("Export file not found")
    }
    return {
      fileId: file.id,
      fileName: file.fileName,
      status: file.status,
      path: file.path,
      totalRecords:
        (file.meta as { totalRecords?: number } | null)?.totalRecords ?? 0,
    }
  }
}

export const leaderboardService = new LeaderboardService()
