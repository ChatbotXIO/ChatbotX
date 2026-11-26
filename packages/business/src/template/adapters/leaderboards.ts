import { and, db, eq } from "@chatbotx.io/database/client"
import type {
  LeaderboardPlatform,
  LeaderboardRewardSettings,
  LeaderboardRules,
  LeaderboardScope,
} from "@chatbotx.io/database/partials"
import { inboxRepository } from "@chatbotx.io/database/repositories"
import { leaderboardModel } from "@chatbotx.io/database/schema"
import { ChatbotXException } from "../../errors"
import {
  LEADERBOARD_PLATFORM_CHANNEL,
  leaderboardService,
} from "../../leaderboard/service"
import { collectResourceDependencies } from "../manifest-references"
import { createLinkRewritePatcher } from "./link-rewrite-patcher"
import {
  dependenciesOn,
  makeCollector,
  recordCopy,
  resolveRef,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import { resolveToolImageUrl, stageToolImages } from "./staging"
import type {
  PatchTask,
  ResourceAdapter,
  StagedObject,
  TemplateInstallContext,
  TemplateStageContext,
} from "./types"

type TemplateLeaderboardEntry = {
  sourceId: string
  name: string
  description: string
  coverImageUrl: string
  startsAt: string
  endsAt: string
  platform: LeaderboardPlatform
  /** The source inbox the campaign runs on; null for `gamification`, which is scored from a minigame. */
  inboxSourceId: string | null
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

/** What the Phase-2 write sets: the description (may carry a link) and the flows. */
type LinkedLeaderboardFields = Pick<
  TemplateLeaderboardEntry,
  "description" | "referralWelcomeFlowId" | "rewardSettings"
>

const LEADERBOARD_IMAGE_SKIPPED = "leaderboardImage"
const coverSlot = (entry: TemplateLeaderboardEntry) => ({
  stageKey: `leaderboards:${entry.sourceId}:cover`,
  url: entry.coverImageUrl,
})

/**
 * The scope with what only means something on the creator's account cleared:
 * post ids (the selection falls back to every post) and Telegram groups (the
 * rules that need a group are switched off). Reported once, as a selection the
 * installer must make again.
 */
const portableScope = (
  ctx: TemplateInstallContext,
  entry: TemplateLeaderboardEntry,
): { scope: LeaderboardScope; rules: LeaderboardRules } => {
  const { scope, rules } = entry
  const clearsPosts = scope.postScope === "specific" || scope.postIds.length > 0
  const clearsChats = scope.telegramChatIds.length > 0
  if (clearsPosts || clearsChats) {
    ctx.warn({
      category: "leaderboards",
      entityKind: "postSelectionRequired",
      path: `leaderboards.${entry.sourceId}.scope`,
      value: [...scope.postIds, ...scope.telegramChatIds].join(","),
    })
  }
  return {
    scope: { postScope: "all", postIds: [], telegramChatIds: [] },
    rules: clearsChats
      ? {
          ...rules,
          ...(rules.joinGroup
            ? { joinGroup: { ...rules.joinGroup, enabled: false } }
            : {}),
          ...(rules.groupDiscussion
            ? { groupDiscussion: { ...rules.groupDiscussion, enabled: false } }
            : {}),
        }
      : rules,
  }
}

/**
 * The inbox or minigame the campaign is scored on in this workspace, or null
 * when there is none (the campaign is then skipped, never widened to something
 * else): a channel campaign needs an inbox of its own channel that the
 * installer bound; a gamification one needs its minigame to come along.
 */
const resolveHost = (
  ctx: TemplateInstallContext,
  entry: TemplateLeaderboardEntry,
  inboxChannels: ReadonlyMap<string, string>,
): { inboxId: string | null; minigameId: string | null } | null => {
  if (entry.platform === "gamification") {
    const minigameId = entry.minigameId
      ? (ctx.idMaps.minigame?.get(entry.minigameId) ?? null)
      : null
    return minigameId ? { inboxId: null, minigameId } : null
  }
  const inboxId = entry.inboxSourceId
    ? ctx.idMaps.inbox?.get(entry.inboxSourceId)
    : undefined
  if (!inboxId) {
    return null
  }
  return inboxChannels.get(inboxId) ===
    LEADERBOARD_PLATFORM_CHANNEL[entry.platform]
    ? { inboxId, minigameId: null }
    : null
}

/** The channel of every distinct inbox the channel-backed entries are bound to: one workspace-scoped query, however many leaderboards share an inbox. */
const loadInboxChannels = async (
  ctx: TemplateInstallContext,
  entries: readonly TemplateLeaderboardEntry[],
): Promise<Map<string, string>> => {
  const ids = new Set<string>()
  for (const entry of entries) {
    const inboxId =
      entry.platform !== "gamification" && entry.inboxSourceId
        ? ctx.idMaps.inbox?.get(entry.inboxSourceId)
        : undefined
    if (inboxId) {
      ids.add(inboxId)
    }
  }
  const inboxes = await inboxRepository.listIdentitiesByIds(
    { workspaceId: ctx.workspaceId, ids: [...ids] },
    ctx.tx,
  )
  return new Map(inboxes.map((inbox) => [inbox.id, inbox.channel]))
}

/**
 * What a template does with every column of `Leaderboard`. Participants, scores and the reward ledger are
 * separate tables and never travel.
 */
export const LEADERBOARD_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  name: "copy",
  // Links follow the copies once every tool exists.
  description: "copy",
  // Staged into the installer's storage.
  coverImageUrl: "copy",
  startsAt: "copy",
  endsAt: "copy",
  // Always installed as a draft.
  status: "reset",
  platform: "copy",
  // The installer's inbox of the same channel.
  inboxId: "rebind",
  // The copied minigame.
  minigameId: "rebind",
  // Post ids and Telegram groups are cleared.
  scope: "rebind",
  // Rules that need a cleared group are switched off.
  rules: "rebind",
  followersOnly: "copy",
  tagIds: "rebind",
  resetTime: "copy",
  cooldownSeconds: "copy",
  // Written once flows exist.
  referralWelcomeFlowId: "reference",
  // Its flow id is written once flows exist.
  rewardSettings: "reference",
  rewardsTriggeredAt: "reset",
  // Who was rewarded: history.
  rewardRecipients: "drop",
  finishedAt: "reset",
  deletedAt: "reset",
} as const satisfies Record<
  keyof typeof leaderboardModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/** The service-validated draft of one entry, or null (with a warning) when the service refuses the configuration. */
const insertDraft = async (
  ctx: TemplateInstallContext,
  entry: TemplateLeaderboardEntry,
  resolved: Pick<
    Parameters<typeof leaderboardService.insertDraftInTx>[1],
    "scope" | "rules" | "tagIds" | "inboxId" | "minigameId"
  >,
) => {
  try {
    return await leaderboardService.insertDraftInTx(ctx.tx, {
      workspaceId: ctx.workspaceId,
      name: entry.name,
      description: entry.description,
      coverImageUrl: entry.coverImageUrl
        ? resolveToolImageUrl(ctx, {
            ...coverSlot(entry),
            category: "leaderboards",
            skippedKind: LEADERBOARD_IMAGE_SKIPPED,
            path: `leaderboards.${entry.sourceId}.coverImageUrl`,
          })
        : "",
      startsAt: new Date(entry.startsAt),
      endsAt: new Date(entry.endsAt),
      platform: entry.platform,
      ...resolved,
      followersOnly: entry.followersOnly,
      resetTime: entry.resetTime,
      cooldownSeconds: entry.cooldownSeconds,
      // Written by the patch once flows exist.
      referralWelcomeFlowId: null,
      rewardSettings: { ...entry.rewardSettings, flowId: null },
    })
  } catch (error) {
    if (!(error instanceof ChatbotXException)) {
      throw error
    }
    // A configuration the service refuses cannot be installed: say so, never widen it.
    ctx.warn({
      category: "leaderboards",
      entityKind: "leaderboardInvalid",
      path: `leaderboards.${entry.sourceId}`,
      value: error.message,
    })
    return null
  }
}

/** The tags a leaderboard names, mapped to the installer's; one that did not come along is dropped with a warning. */
const remapTags = (
  ctx: TemplateInstallContext,
  entry: TemplateLeaderboardEntry,
): string[] =>
  entry.tagIds.flatMap((tagId) => {
    const target = resolveRef(ctx, {
      category: "leaderboards",
      kind: "tag",
      path: `leaderboards.${entry.sourceId}.tagIds`,
      sourceRef: tagId,
    })
    return target ? [target] : []
  })

/** Defers the Phase-2 write of one copied leaderboard: links and flows follow the copies once they exist. */
const deferLeaderboardPatch = (
  patcher: ReturnType<typeof createLinkRewritePatcher<LinkedLeaderboardFields>>,
  entry: TemplateLeaderboardEntry,
  createdId: string,
): void => {
  patcher.defer({
    sourceId: entry.sourceId,
    original: {
      description: entry.description,
      referralWelcomeFlowId: entry.referralWelcomeFlowId,
      rewardSettings: entry.rewardSettings,
    },
    finish: (linked, patchCtx) => {
      const resolve = (path: string, flowId: string | null) =>
        resolveRef(patchCtx, {
          category: "leaderboards",
          kind: "flow",
          path: `leaderboards.${entry.sourceId}.${path}`,
          sourceRef: flowId,
        })
      return {
        description: linked.description,
        referralWelcomeFlowId: resolve(
          "referralWelcomeFlowId",
          linked.referralWelcomeFlowId,
        ),
        rewardSettings: {
          ...linked.rewardSettings,
          flowId: resolve(
            "rewardSettings.flowId",
            linked.rewardSettings.flowId,
          ),
        },
      }
    },
    write: async (tx, values, patchCtx) => {
      await tx
        .update(leaderboardModel)
        .set(values)
        .where(
          and(
            eq(leaderboardModel.id, createdId),
            eq(leaderboardModel.workspaceId, patchCtx.workspaceId),
          ),
        )
    },
  })
}

/**
 * A leaderboard is copied as a draft with its configuration: rules, window,
 * reward settings and tags; participants, scores, the reward ledger and the
 * Redis ranking never travel, and the post and Telegram selections are cleared.
 * It needs its host (an inbox of the right channel, or its minigame); without
 * one it is skipped with a warning rather than installed on a wider scope.
 * The flows (welcome, reward) are written once flows exist.
 */
export const leaderboardsAdapter: ResourceAdapter<TemplateLeaderboardEntry> = {
  category: "leaderboards",
  providesKinds: ["leaderboard"],
  consumesKinds: ["inbox", "minigame", "tag", "flow"],
  deferredKinds: ["flow"],
  trackedKind: "leaderboard",
  folderTypes: [],
  // The description can link to the campaign's own minigame, or to itself.
  rewritesLinksInPatch: true,
  minFormatVersion: 3,
  sync: updateNotSupported("leaderboards"),

  async stage(
    ctx: TemplateStageContext,
    entries: readonly TemplateLeaderboardEntry[],
  ): Promise<Map<string, StagedObject>> {
    return await stageToolImages(
      ctx,
      entries.filter((entry) => entry.coverImageUrl).map(coverSlot),
      LEADERBOARD_IMAGE_SKIPPED,
    )
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateLeaderboardEntry[],
  ): Promise<PatchTask[]> {
    // Links follow the copies once every tool exists, flows once flows do: one
    // Phase-2 write per leaderboard covers both.
    const patcher =
      createLinkRewritePatcher<LinkedLeaderboardFields>("leaderboards")
    const inboxChannels = await loadInboxChannels(ctx, entries)
    for (const entry of entries) {
      const host = resolveHost(ctx, entry, inboxChannels)
      if (!host) {
        ctx.warn({
          category: "leaderboards",
          entityKind: "leaderboardHostMissing",
          path: `leaderboards.${entry.sourceId}`,
          value: entry.inboxSourceId ?? entry.minigameId ?? "",
        })
        continue
      }
      const { scope, rules } = portableScope(ctx, entry)
      const tagIds = remapTags(ctx, entry)
      const endsAt = new Date(entry.endsAt)
      const created = await insertDraft(ctx, entry, {
        ...host,
        scope,
        rules,
        tagIds,
      })
      if (!created) {
        continue
      }
      if (endsAt <= new Date()) {
        ctx.warn({
          category: "leaderboards",
          entityKind: "scheduleExpired",
          path: `leaderboards.${entry.sourceId}.endsAt`,
          value: entry.endsAt,
        })
      }
      recordCopy(ctx, {
        category: "leaderboards",
        resourceKind: "leaderboard",
        idMapKind: "leaderboard",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })
      deferLeaderboardPatch(patcher, entry, created.id)
    }
    return patcher.tasks()
  },

  collector: makeCollector({
    findIds: (query) =>
      db.query.leaderboardModel.findMany({
        where: scopedWhere(query, { deletedAt: { isNull: true } }),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.leaderboardModel.findMany({
        where: scopedWhere(
          { workspaceId, ids },
          { deletedAt: { isNull: true } },
        ),
      })
      return {
        entries: rows.map(
          (row): TemplateLeaderboardEntry => ({
            sourceId: row.id,
            name: row.name,
            description: row.description,
            coverImageUrl: row.coverImageUrl,
            startsAt: row.startsAt.toISOString(),
            endsAt: row.endsAt.toISOString(),
            platform: row.platform,
            inboxSourceId: row.inboxId,
            minigameId: row.minigameId,
            scope: row.scope,
            rules: row.rules,
            followersOnly: row.followersOnly,
            tagIds: row.tagIds,
            resetTime: row.resetTime,
            cooldownSeconds: row.cooldownSeconds,
            referralWelcomeFlowId: row.referralWelcomeFlowId,
            rewardSettings: row.rewardSettings,
          }),
        ),
        inboxIds: rows.flatMap((row) => (row.inboxId ? [row.inboxId] : [])),
        hardDependencies: [
          ...dependenciesOn(
            "minigames",
            rows.map((row) => row.minigameId),
          ),
          ...rows.flatMap((row) =>
            collectResourceDependencies({
              referralWelcomeFlowId: row.referralWelcomeFlowId,
              rewardSettings: row.rewardSettings,
            }),
          ),
        ],
      }
    },
  }),
}
