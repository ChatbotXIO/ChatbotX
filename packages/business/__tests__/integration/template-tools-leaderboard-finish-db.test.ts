// @vitest-environment node

/**
 * The overdue-leaderboard cron against a copy whose template is being
 * uninstalled: the copy is left alone and a sibling leaderboard still finishes.
 * Commits for real, so each test deletes its workspaces afterwards.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  minigameAppearanceSchema,
  minigameGeneralSettingsSchema,
  minigameNonWinningMessageSettingsSchema,
  minigamePlayerSettingsSchema,
  minigamePrizeSettingsSchema,
  minigameWinningMessageSettingsSchema,
} from "@chatbotx.io/database/partials"
import {
  leaderboardRepository,
  templateInstallationRepository,
} from "@chatbotx.io/database/repositories"
import {
  leaderboardModel,
  templateModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/events")>()),
  updateTriggerCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  enqueueUninstallTemplate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../src/template/uninstall-effect-runners", () => ({}))

const { templateUninstallService } = await import(
  "../../src/template/uninstall.service"
)
const { templateUninstallExecuteService } = await import(
  "../../src/template/uninstall-execute.service"
)
const { leaderboardRankingService } = await import(
  "../../src/leaderboard/ranking"
)
const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { minigameService } = await import("../../src/minigame/service")
const { leaderboardService } = await import("../../src/leaderboard/service")
const { minigamesAdapter } = await import(
  "../../src/template/adapters/minigames"
)
const { leaderboardsAdapter } = await import(
  "../../src/template/adapters/leaderboards"
)

const databaseUrl = realDatabaseUrl()

const seedWorkspace = async (label: string) => {
  const suffix = createId()
  const [owner] = await db
    .insert(userModel)
    .values({ email: `${label}-${suffix}@example.test` })
    .returning({ id: userModel.id })
  const [workspace] = await db
    .insert(workspaceModel)
    .values({ name: `${label}-${suffix}`, ownerId: owner.id })
    .returning({ id: workspaceModel.id })
  return { workspaceId: workspace.id, userId: owner.id }
}

const minigameInput = (workspaceId: string, name: string) => ({
  workspaceId,
  type: "jackpot" as const,
  generalSettings: minigameGeneralSettingsSchema.parse({
    name,
    playedAtFrom: "2099-01-01T00:00:00.000Z",
    playedAtTo: "2099-02-01T00:00:00.000Z",
  }),
  appearance: minigameAppearanceSchema.parse({
    backgroundImage: {},
    prizeDescriptionImage: {},
    startButtonImage: {},
  }),
  playerSettings: minigamePlayerSettingsSchema.parse({
    resetPolicy: "never",
  }),
  prizeSettings: minigamePrizeSettingsSchema.parse({
    prizes: [
      {
        id: "prize-1",
        name: "Coffee",
        winRate: 40,
        quantity: 7,
        icon: {},
      },
    ],
    nonWinning: { title: "Next time", loseRate: 60, loseImage: {} },
  }),
  winningMessageSettings: minigameWinningMessageSettingsSchema.parse({}),
  nonWinningMessageSettings: minigameNonWinningMessageSettingsSchema.parse({}),
})

const FULL = { kind: "apiToken", permission: "full" } as const

const draftInput = (workspaceId: string, minigameId: string, name: string) => ({
  workspaceId,
  name,
  description: "",
  coverImageUrl: "",
  startsAt: new Date("2099-01-01T00:00:00.000Z"),
  endsAt: new Date("2099-02-01T00:00:00.000Z"),
  platform: "gamification" as const,
  inboxId: null,
  minigameId,
  scope: { postScope: "all" as const, postIds: [], telegramChatIds: [] },
  rules: leaderboardService.defaultRules("gamification"),
  followersOnly: false,
  tagIds: [],
  resetTime: "22:00",
  cooldownSeconds: 0,
  referralWelcomeFlowId: null,
  rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
})

describe.skipIf(!databaseUrl)("finishOverdue and template uninstalls", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const track = (seed: { workspaceId: string; userId: string }) => {
    created.push(seed)
    return seed
  }

  const install = async (
    targetWorkspaceId: string,
    sourceWorkspaceId: string,
    resources: Record<string, unknown>,
  ) => {
    const permissions = { allowEdit: true, allowDelete: true }
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: targetWorkspaceId,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: {},
        categoryCounts: {},
        formatVersion: 3,
        shareToken: `tok-${createId()}`,
        defaultPermissions: permissions,
      })
      .returning({ id: templateModel.id })
    const installation = await templateInstallationRepository.create({
      workspaceId: targetWorkspaceId,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId,
      formatVersion: 3,
      status: "pending",
      permissions,
    })
    const parsed = parseTemplateExport({
      formatVersion: 3,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: sourceWorkspaceId, tenantId: "1" },
      manifests: {},
      resources,
    })
    if (!parsed.ok) {
      throw new Error(parsed.reason)
    }
    const seed = {
      workspaceId: targetWorkspaceId,
      installationId: installation.id,
    }
    const claim = await templateInstallService.claim(seed)
    if (!claim) {
      throw new Error("the install could not be claimed")
    }
    await templateInstallService.run({
      ...seed,
      claimToken: claim.claimToken,
      permissions,
      payload: parsed.data,
      templateName: "Template",
      createInstallFolder: false,
      sourceVersion: 1,
    })
    return seed
  }

  const collect = async (
    workspaceId: string,
    adapter: typeof minigamesAdapter | typeof leaderboardsAdapter,
  ) =>
    (
      await adapter.collector.collect(
        workspaceId,
        await adapter.collector.resolveIds(workspaceId, 100),
      )
    ).entries

  test("a leaderboard whose uninstall started is skipped, and the cron still finishes the others", async () => {
    const source = track(await seedWorkspace("fo-src"))
    const target = track(await seedWorkspace("fo-dst"))
    const minigame = await minigameService.create(
      minigameInput(source.workspaceId, "Lucky draw"),
    )
    await leaderboardService.insertDraftInTx(
      db,
      draftInput(source.workspaceId, minigame.id, "Top players"),
    )
    const seed = await install(target.workspaceId, source.workspaceId, {
      minigames: await collect(source.workspaceId, minigamesAdapter),
      leaderboards: await collect(source.workspaceId, leaderboardsAdapter),
    })
    const [copy] = await db.query.leaderboardModel.findMany({
      where: { workspaceId: target.workspaceId },
    })

    // The installer's own campaign in the same workspace, on its own minigame.
    const ownMinigame = await minigameService.create(
      minigameInput(target.workspaceId, "Own draw"),
    )
    const own = await leaderboardService.insertDraftInTx(
      db,
      draftInput(target.workspaceId, ownMinigame.id, "Own board"),
    )
    const ended = new Date("2020-02-01T00:00:00.000Z")
    for (const id of [copy.id, own.id]) {
      await db
        .update(leaderboardModel)
        .set({
          status: "active",
          startsAt: new Date("2020-01-01T00:00:00.000Z"),
          endsAt: ended,
        })
        .where(eq(leaderboardModel.id, id))
    }

    // Phase A only (decide, freeze, tombstone): the uninstall is in progress.
    await templateUninstallService.uninstallAsInstaller({
      workspaceId: target.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.decide({
      ...claim,
      workspaceId: target.workspaceId,
    })

    // The cron reads the whole table: scope it to this test's rows.
    const overdue = await db.query.leaderboardModel.findMany({
      where: { id: { in: [copy.id, own.id] } },
    })
    vi.spyOn(leaderboardRepository, "findOverdue").mockResolvedValue(
      overdue as never,
    )
    vi.spyOn(leaderboardRankingService, "drop").mockResolvedValue(undefined)

    const result = await leaderboardService.finishOverdue(new Date())
    expect(result.finished).toBe(1)

    const after = await db.query.leaderboardModel.findMany({
      where: { id: { in: [copy.id, own.id] } },
    })
    const status = (id: string) => after.find((row) => row.id === id)?.status
    // The uninstall froze it (paused); the cron must not finish it.
    expect(status(copy.id)).toBe("paused")
    expect(status(own.id)).toBe("finished")
  })
})
