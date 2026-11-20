// @vitest-environment node

/**
 * The G2 tools (Mini Apps, minigames, leaderboards) installed against a real
 * Postgres: collected from a source workspace, installed into another, with
 * the history left out, the flows patched in, a published Mini App not offered,
 * and the service's own `update` accepting every copy.
 *
 * Commits for real (the install runs its own transaction), so each test
 * deletes its workspace — everything cascades from it — afterwards.
 * Needs the template migrations applied to the local database.
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
  miniAppRepository,
  minigameRepository,
  templateInstallationRepository,
} from "@chatbotx.io/database/repositories"
import {
  contactModel,
  dynamicImageModel,
  inboxModel,
  integrationWhatsappModel,
  leaderboardAuditLogModel,
  leaderboardModel,
  leaderboardParticipantModel,
  miniAppPublicationModel,
  minigameModel,
  templateModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { createStarterDefinition } from "@chatbotx.io/mini-app"
import { createId } from "@chatbotx.io/utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

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

// The request enqueues a job; the test drives the executor itself, and the
// post-commit effects need Redis and storage (an unregistered effect is skipped).
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  enqueueUninstallTemplate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../../src/template/uninstall-effect-runners", () => ({}))
// Storage is not available here: the dynamic image's background "was copied".
vi.mock("../../src/template/template-staging", () => ({
  stageTemplateObjects: vi.fn(
    async (input: {
      ctx: { workspaceId: string }
      resources: { dynamicImages?: { sourceId: string }[] }
    }) =>
      new Map(
        (input.resources.dynamicImages ?? []).map((entry) => [
          `dynamicImages:${entry.sourceId}:background`,
          {
            targetPath: `public/space/${input.ctx.workspaceId}/template-tool-images/tpl-1/${entry.sourceId}-background_1.png`,
          },
        ]),
      ),
  ),
}))

// The static background is baked by a canvas render and uploaded to storage.
vi.mock("../../src/dynamic-image/render", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/dynamic-image/render")>()),
  renderStaticLayer: vi.fn(),
}))

const { uploader } = await import("@chatbotx.io/filesystem")
const { renderStaticLayer } = await import("../../src/dynamic-image/render")
const { templateUninstallService } = await import(
  "../../src/template/uninstall.service"
)
const { templateUninstallExecuteService } = await import(
  "../../src/template/uninstall-execute.service"
)
const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { miniAppService } = await import("../../src/mini-app/service")
const { dynamicImageService } = await import("../../src/dynamic-image/service")
const { minigameService } = await import("../../src/minigame/service")
const { leaderboardService } = await import("../../src/leaderboard/service")
const { miniAppsAdapter } = await import(
  "../../src/template/adapters/mini-apps"
)
const { minigamesAdapter } = await import(
  "../../src/template/adapters/minigames"
)
const { leaderboardsAdapter } = await import(
  "../../src/template/adapters/leaderboards"
)
const { UNINSTALL_HANDLER_BY_KIND } = await import(
  "../../src/template/adapters/uninstall-handlers"
)
const { uninstallContext } = await import(
  "../../src/template/adapters/uninstall-kit"
)
const { listSelectableResources } = await import(
  "../../src/template/selectable-resources"
)

const databaseUrl = realDatabaseUrl()
const FULL = { kind: "apiToken", permission: "full" } as const

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

const seedWhatsappIntegration = async (workspaceId: string) => {
  const [inbox] = await db
    .insert(inboxModel)
    .values({
      id: createId(),
      workspaceId,
      name: "WhatsApp",
      channel: "whatsapp",
      sourceId: `wa-${createId()}`,
    } as never)
    .returning({ id: inboxModel.id })
  const [row] = await db
    .insert(integrationWhatsappModel)
    .values({
      id: createId(),
      workspaceId,
      auth: {},
      phoneNumberId: `pn-${createId()}`,
      wabaId: "waba",
      businessId: "biz",
      name: "WhatsApp",
      inboxId: inbox.id,
    } as never)
    .returning({ id: integrationWhatsappModel.id })
  return row.id
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

describe.skipIf(!databaseUrl)("template tools (G2) on a real database", () => {
  const created: { workspaceId: string; userId: string }[] = []

  beforeEach(() => {
    vi.mocked(renderStaticLayer)
      .mockReset()
      .mockResolvedValue(Buffer.from("png"))
    vi.spyOn(uploader, "putObject").mockResolvedValue(undefined as never)
    vi.spyOn(uploader, "listObjects").mockResolvedValue({
      Contents: [],
    } as never)
    vi.spyOn(uploader, "deleteObject").mockResolvedValue(undefined as never)
  })

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

  /** What the creator's workspace collects for the three tools. */
  const collectFrom = async (sourceWorkspaceId: string) => {
    const collect = async (adapter: {
      collector: {
        resolveIds: (w: string, limit: number) => Promise<string[]>
        collect: (
          w: string,
          ids: string[],
        ) => Promise<{ entries: readonly unknown[] }>
      }
    }) =>
      (
        await adapter.collector.collect(
          sourceWorkspaceId,
          await adapter.collector.resolveIds(sourceWorkspaceId, 100),
        )
      ).entries
    return {
      miniApps: await collect(miniAppsAdapter),
      minigames: await collect(minigamesAdapter),
      leaderboards: await collect(leaderboardsAdapter),
    }
  }

  const install = async (
    targetWorkspaceId: string,
    sourceWorkspaceId: string,
    resources: Record<string, unknown>,
    permissions = { allowEdit: true, allowDelete: true },
  ) => {
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

  test("copies a Mini App and a minigame with their prizes and leaves the history out; a gamification leaderboard follows its minigame as a draft", async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    await miniAppService.create({
      workspaceId: source.workspaceId,
      name: "Survey",
      definition: createStarterDefinition("Welcome"),
    })
    const minigame = await minigameService.create(
      minigameInput(source.workspaceId, "Lucky draw"),
    )
    await leaderboardService.insertDraftInTx(db, {
      workspaceId: source.workspaceId,
      name: "Top players",
      description: "",
      coverImageUrl: "",
      startsAt: new Date("2099-01-01T00:00:00.000Z"),
      endsAt: new Date("2099-02-01T00:00:00.000Z"),
      platform: "gamification",
      inboxId: null,
      minigameId: minigame.id,
      scope: { postScope: "all", postIds: [], telegramChatIds: [] },
      rules: leaderboardService.defaultRules("gamification"),
      followersOnly: false,
      tagIds: [],
      resetTime: "22:00",
      cooldownSeconds: 0,
      referralWelcomeFlowId: null,
      rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
    })
    // Counters are history: bump one on the source.
    await db
      .update(minigameModel)
      .set({ playsCount: 99 })
      .where(eq(minigameModel.id, minigame.id))

    const seed = await install(
      target.workspaceId,
      source.workspaceId,
      await collectFrom(source.workspaceId),
    )

    const [copyMiniApp] = await db.query.miniAppModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(copyMiniApp.name).toBe("Survey")
    expect(copyMiniApp.submissionsCount).toBe(0)

    const [copy] = await db.query.minigameModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(copy.generalSettings.name).toBe("Lucky draw")
    expect(copy.playsCount).toBe(0)
    expect(copy.prizeSettings.prizes).toHaveLength(1)
    expect(copy.prizeSettings.prizes[0]?.quantity).toBe(7)

    const [board] = await db.query.leaderboardModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(board.status).toBe("draft")
    expect(board.minigameId).toBe(copy.id)

    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: seed.installationId,
        workspaceId: target.workspaceId,
      })
    expect(installation?.warnings).toEqual([])
  })

  test("links between the installed tools, and to a tool itself, follow the copies whatever the install order; unknown links stay", async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    const miniApp = await miniAppService.create({
      workspaceId: source.workspaceId,
      name: "Survey",
      definition: createStarterDefinition("Welcome"),
    })
    const minigame = await minigameService.create(
      minigameInput(source.workspaceId, "Lucky draw"),
    )
    const origin = "https://app.example.test"
    const ws = source.workspaceId
    const unknown = `${origin}/minigames?minigameId=999999`
    const collected = await collectFrom(ws)
    const [miniAppEntry] = collected.miniApps as {
      definition: {
        screens: { children: { props: Record<string, unknown> }[] }[]
      }
    }[]
    // Mini Apps install before minigames: the link to one needs the patch.
    miniAppEntry.definition.screens[0].children[0].props.text = [
      `${origin}/minigames?minigameId=${minigame.id}&token={{minigame_play_token}}`,
      `${origin}/mini-apps?id=${miniApp.id}`,
      unknown,
    ].join(" ")
    const [minigameEntry] = collected.minigames as {
      generalSettings: { rulesDescription: string }
      winningMessageSettings: { description: string }
    }[]
    minigameEntry.winningMessageSettings.description = `${origin}/mini-apps?id=${miniApp.id}`
    minigameEntry.generalSettings.rulesDescription = `${origin}/minigames?minigameId=${minigame.id}`
    const dynamicImages = [
      {
        sourceId: "900",
        name: "Badge",
        enabled: true,
        backgroundUrl: `${ws}/bg_1.png`,
        customFieldId: null,
        data: {
          width: 300,
          height: 300,
          elements: [
            {
              id: "qr",
              type: "qrCode",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              priority: false,
              size: 128,
              color: "#000000",
              // A minigame, a Mini App and the image itself.
              text: `${origin}/minigames?minigameId=${minigame.id} ${origin}/mini-apps?id=${miniApp.id} ${origin}/dynamic-images?dynamicImageId=900`,
            },
          ],
        },
      },
    ]

    await install(target.workspaceId, ws, { ...collected, dynamicImages })

    const [copyMiniApp] = await db.query.miniAppModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    const [copyMinigame] = await db.query.minigameModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    const [copyImage] = await db.query.dynamicImageModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    const heading = JSON.stringify(copyMiniApp.definition)
    expect(heading).toContain(
      `${origin}/minigames?minigameId=${copyMinigame.id}&token={{minigame_play_token}}`,
    )
    expect(heading).toContain(`${origin}/mini-apps?id=${copyMiniApp.id}`)
    expect(heading).toContain(unknown)
    expect(heading).not.toContain(miniApp.id)
    expect(heading).not.toContain(minigame.id)
    // The generated Flow JSON follows the definition.
    expect(JSON.stringify(copyMiniApp.flowJson)).toContain(
      `minigameId=${copyMinigame.id}`,
    )
    expect(copyMinigame.winningMessageSettings.description).toBe(
      `${origin}/mini-apps?id=${copyMiniApp.id}`,
    )
    expect(copyMinigame.generalSettings.rulesDescription).toBe(
      `${origin}/minigames?minigameId=${copyMinigame.id}`,
    )
    expect(copyMinigame.generalSettings.name).toBe("Lucky draw")
    const [qr] = copyImage.data.elements
    const remappedText = `${origin}/minigames?minigameId=${copyMinigame.id} ${origin}/mini-apps?id=${copyMiniApp.id} ${origin}/dynamic-images?dynamicImageId=${copyImage.id}`
    expect(qr).toMatchObject({ text: remappedText })

    // The QR is baked into the background, so the background was rendered
    // again from the REMAPPED document and the row serves the new file.
    expect(renderStaticLayer).toHaveBeenCalledTimes(1)
    const rendered = vi.mocked(renderStaticLayer).mock.calls[0][0]
    expect(rendered.elements[0]).toMatchObject({ text: remappedText })
    expect(copyImage.enabled).toBe(true)
    expect(copyImage.backgroundUrl).toMatch(
      new RegExp(
        `^public/space/${target.workspaceId}/dynamic-images/${copyImage.id}/background_\\d+\\.png$`,
      ),
    )
    expect(uploader.putObject).toHaveBeenCalledWith(
      copyImage.backgroundUrl,
      expect.any(Buffer),
      expect.objectContaining({ ContentType: "image/png" }),
    )
  })

  test("a dynamic image whose background cannot be re-rendered stays off and the installer is warned", async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    const miniApp = await miniAppService.create({
      workspaceId: source.workspaceId,
      name: "Survey",
      definition: createStarterDefinition("Welcome"),
    })
    const ws = source.workspaceId
    const collected = await collectFrom(ws)
    vi.mocked(renderStaticLayer).mockRejectedValue(new Error("canvas down"))
    const seed = await install(target.workspaceId, ws, {
      ...collected,
      dynamicImages: [
        {
          sourceId: "900",
          name: "Badge",
          enabled: true,
          backgroundUrl: `${ws}/bg_1.png`,
          customFieldId: null,
          data: {
            width: 300,
            height: 300,
            elements: [
              {
                id: "qr",
                type: "qrCode",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                priority: false,
                size: 128,
                color: "#000000",
                text: `https://app.example.test/mini-apps?id=${miniApp.id}`,
              },
            ],
          },
        },
      ],
    })

    const [copyImage] = await db.query.dynamicImageModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    // Never serving the creator's QR: the copy is off and the stored link is the copy's.
    expect(copyImage.enabled).toBe(false)
    expect(copyImage.backgroundUrl).toBe(
      `public/space/${target.workspaceId}/template-tool-images/tpl-1/900-background_1.png`,
    )
    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: seed.installationId,
        workspaceId: target.workspaceId,
      })
    expect(installation?.status).toBe("partial")
    expect(installation?.warnings).toEqual([
      expect.objectContaining({
        category: "dynamicImages",
        entityKind: "dynamicImageRerenderFailed",
      }),
    ])
  })

  /** A copy whose re-render failed at install: off, still on its staged background. */
  const installStaleImage = async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    const miniApp = await miniAppService.create({
      workspaceId: source.workspaceId,
      name: "Survey",
      definition: createStarterDefinition("Welcome"),
    })
    const collected = await collectFrom(source.workspaceId)
    vi.mocked(renderStaticLayer).mockRejectedValue(new Error("canvas down"))
    await install(target.workspaceId, source.workspaceId, {
      ...collected,
      dynamicImages: [
        {
          sourceId: "900",
          name: "Badge",
          enabled: true,
          backgroundUrl: `${source.workspaceId}/bg_1.png`,
          customFieldId: null,
          data: {
            width: 300,
            height: 300,
            elements: [
              {
                id: "qr",
                type: "qrCode",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                priority: false,
                size: 128,
                color: "#000000",
                text: `https://app.example.test/mini-apps?id=${miniApp.id}`,
              },
            ],
          },
        },
      ],
    })
    const [copy] = await db.query.dynamicImageModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(copy.enabled).toBe(false)
    vi.mocked(renderStaticLayer)
      .mockReset()
      .mockResolvedValue(Buffer.from("png"))
    vi.mocked(uploader.putObject).mockClear()
    vi.mocked(uploader.deleteObject).mockClear()
    return { workspaceId: target.workspaceId, copy }
  }

  test("a late re-render never overwrites an installer who switched the copy on first", async () => {
    const { workspaceId, copy } = await installStaleImage()
    await db
      .update(dynamicImageModel)
      .set({ enabled: true })
      .where(eq(dynamicImageModel.id, copy.id))

    const applied = await dynamicImageService.rerenderInstalledBackground({
      workspaceId,
      id: copy.id,
      enabled: true,
    })

    expect(applied).toBe(false)
    const after = await dynamicImageService.find({ workspaceId, id: copy.id })
    expect(after.backgroundUrl).toBe(copy.backgroundUrl)
    expect(vi.mocked(uploader.putObject)).not.toHaveBeenCalled()
  })

  test("a re-render that loses the compare-and-set deletes only its own upload", async () => {
    const { workspaceId, copy } = await installStaleImage()
    // The installer's save lands while the render is in flight.
    const editedUrl = `public/space/${workspaceId}/dynamic-images/${copy.id}/background_1.png`
    vi.mocked(renderStaticLayer).mockImplementationOnce(async () => {
      await db
        .update(dynamicImageModel)
        .set({ backgroundUrl: editedUrl })
        .where(eq(dynamicImageModel.id, copy.id))
      return Buffer.from("png")
    })

    const applied = await dynamicImageService.rerenderInstalledBackground({
      workspaceId,
      id: copy.id,
      enabled: true,
    })

    expect(applied).toBe(false)
    const after = await dynamicImageService.find({ workspaceId, id: copy.id })
    expect(after).toMatchObject({ backgroundUrl: editedUrl, enabled: false })
    const uploaded = vi.mocked(uploader.putObject).mock.calls[0][0]
    expect(vi.mocked(uploader.deleteObject).mock.calls).toEqual([[uploaded]])
  })

  test("a save that commits right after the re-render's compare-and-set keeps its newer background", async () => {
    const { workspaceId, copy } = await installStaleImage()
    const newer = `public/space/${workspaceId}/dynamic-images/${copy.id}/background_9999999999999999.png`
    // The folder now holds the saver's file; a prefix sweep would delete it.
    vi.mocked(uploader.listObjects).mockImplementation((async (
      prefix: string,
    ) => ({
      Contents: prefix.includes("/background") ? [{ Key: newer }] : [],
    })) as never)

    const applied = await dynamicImageService.rerenderInstalledBackground({
      workspaceId,
      id: copy.id,
      enabled: false,
    })

    expect(applied).toBe(true)
    const deleted = vi
      .mocked(uploader.deleteObject)
      .mock.calls.map(([key]) => key)
    expect(deleted).not.toContain(newer)
    expect(deleted).toEqual([copy.backgroundUrl])
  })

  test("a save that fails while a re-render is in flight leaves the re-render's file and a consistent row", async () => {
    const { workspaceId, copy } = await installStaleImage()
    const other = await dynamicImageService.create({
      workspaceId,
      name: "Other",
      data: copy.data,
    })
    vi.mocked(uploader.putObject).mockClear()
    vi.mocked(uploader.deleteObject).mockClear()
    let saveFailure: unknown
    let reentered = false
    vi.mocked(uploader.putObject).mockImplementation((async () => {
      if (reentered) {
        return
      }
      reentered = true
      // The re-render has just uploaded; an editor save with a taken name fails.
      saveFailure = await dynamicImageService
        .update({
          workspaceId,
          id: copy.id,
          name: other.name,
          customFieldId: null,
          data: copy.data,
        })
        .then(
          () => null,
          (error: unknown) => error,
        )
    }) as never)

    const applied = await dynamicImageService.rerenderInstalledBackground({
      workspaceId,
      id: copy.id,
      enabled: false,
    })

    expect(saveFailure).toBeTruthy()
    expect(applied).toBe(true)
    const [reRenderUpload] = vi.mocked(uploader.putObject).mock.calls[0]
    const after = await dynamicImageService.find({ workspaceId, id: copy.id })
    expect(after.backgroundUrl).toBe(reRenderUpload)
    expect(
      vi.mocked(uploader.deleteObject).mock.calls.map(([key]) => key),
    ).not.toContain(reRenderUpload)
  })

  test("turning on a copy whose re-render failed retries it, and refuses while it still fails", async () => {
    const { workspaceId, copy } = await installStaleImage()
    vi.mocked(renderStaticLayer).mockRejectedValueOnce(new Error("still down"))
    await expect(
      dynamicImageService.setEnabled({ workspaceId, id: copy.id }, true),
    ).rejects.toMatchObject({ code: "dynamicImageBackgroundStale" })
    expect(
      (await dynamicImageService.find({ workspaceId, id: copy.id })).enabled,
    ).toBe(false)

    const enabled = await dynamicImageService.setEnabled(
      { workspaceId, id: copy.id },
      true,
    )
    expect(enabled.enabled).toBe(true)
    expect(enabled.backgroundUrl).toMatch(
      new RegExp(
        `^public/space/${workspaceId}/dynamic-images/${copy.id}/background_\\d+\\.png$`,
      ),
    )
  })

  test("a source-off copy with nothing rewritten enables without a render, even when its static layer cannot render", async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    await install(target.workspaceId, source.workspaceId, {
      dynamicImages: [
        {
          sourceId: "900",
          name: "Badge",
          enabled: false,
          backgroundUrl: `${source.workspaceId}/bg_1.png`,
          customFieldId: null,
          data: {
            width: 300,
            height: 300,
            elements: [
              {
                id: "qr",
                type: "qrCode",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                priority: false,
                size: 128,
                color: "#000000",
                text: "https://example.test/plain",
              },
            ],
          },
        },
      ],
    })
    const [copy] = await db.query.dynamicImageModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    expect(copy.enabled).toBe(false)
    vi.mocked(renderStaticLayer)
      .mockReset()
      .mockRejectedValue(new Error("down"))

    const enabled = await dynamicImageService.setEnabled(
      { workspaceId: target.workspaceId, id: copy.id },
      true,
    )

    expect(enabled.enabled).toBe(true)
    expect(enabled.backgroundUrl).toBe(copy.backgroundUrl)
    expect(renderStaticLayer).not.toHaveBeenCalled()
  })

  test("saving a marked copy clears the stale marker so it enables without a render", async () => {
    const { workspaceId, copy } = await installStaleImage()
    await dynamicImageService.update({
      workspaceId,
      id: copy.id,
      name: copy.name,
      customFieldId: copy.customFieldId,
      data: copy.data,
    })
    vi.mocked(renderStaticLayer)
      .mockReset()
      .mockRejectedValue(new Error("down"))

    const enabled = await dynamicImageService.setEnabled(
      { workspaceId, id: copy.id },
      true,
    )

    expect(enabled.enabled).toBe(true)
    expect(renderStaticLayer).not.toHaveBeenCalled()
  })

  test("a leaderboard on a channel with no bound inbox is skipped with a warning, never widened", async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    const entries = [
      {
        sourceId: "900",
        name: "Messenger board",
        description: "",
        coverImageUrl: "",
        startsAt: "2099-01-01T00:00:00.000Z",
        endsAt: "2099-02-01T00:00:00.000Z",
        platform: "messenger",
        inboxSourceId: "1234",
        minigameId: null,
        scope: { postScope: "all", postIds: [], telegramChatIds: [] },
        rules: leaderboardService.defaultRules("messenger"),
        followersOnly: false,
        tagIds: [],
        resetTime: "22:00",
        cooldownSeconds: 0,
        referralWelcomeFlowId: null,
        rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
      },
    ]
    const seed = await install(target.workspaceId, source.workspaceId, {
      leaderboards: entries,
    })

    expect(
      await db.query.leaderboardModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: seed.installationId,
        workspaceId: target.workspaceId,
      })
    expect(installation?.warnings.map((warning) => warning.entityKind)).toEqual(
      ["leaderboardHostMissing"],
    )
  })

  test("a Mini App published to WhatsApp is not offered, and the service's own update accepts every copy", async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    const published = await miniAppService.create({
      workspaceId: source.workspaceId,
      name: "Published app",
      definition: createStarterDefinition("Welcome"),
    })
    await miniAppService.create({
      workspaceId: source.workspaceId,
      name: "Draft app",
      definition: createStarterDefinition("Welcome"),
    })
    await db.insert(miniAppPublicationModel).values({
      id: createId(),
      miniAppId: published.id,
      integrationWhatsappId: await seedWhatsappIntegration(source.workspaceId),
      sourceId: "meta-flow-1",
      status: "PUBLISHED",
      validationErrors: [],
      publishedAt: new Date(),
    })

    const offered = await listSelectableResources({
      workspaceId: source.workspaceId,
      category: "miniApps",
      actor: FULL,
    })
    expect(offered.items.map((item) => item.name)).toEqual(["Draft app"])

    // The save warning looks up only published Mini Apps of the source workspace.
    const [draft] = await db.query.miniAppModel.findMany({
      where: { workspaceId: source.workspaceId, name: "Draft app" },
    })
    const ids = [published.id, draft.id]
    await expect(
      miniAppRepository.listPublishedNamesByIds({
        workspaceId: source.workspaceId,
        ids,
      }),
    ).resolves.toEqual([{ id: published.id, name: "Published app" }])
    await expect(
      miniAppRepository.listPublishedNamesByIds({
        workspaceId: target.workspaceId,
        ids,
      }),
    ).resolves.toEqual([])

    const collected = await collectFrom(source.workspaceId)
    expect(collected.miniApps).toHaveLength(1)
    await install(target.workspaceId, source.workspaceId, {
      miniApps: collected.miniApps,
    })
    const [copy] = await db.query.miniAppModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    await expect(
      miniAppService.update(
        { workspaceId: target.workspaceId, id: copy.id },
        { name: copy.name },
      ),
    ).resolves.toMatchObject({ id: copy.id })
  })

  test("View-only copies refuse content edits; an uninstall removes the copies and what they gathered", async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    await minigameService.create(
      minigameInput(source.workspaceId, "Lucky draw"),
    )
    const view = { allowEdit: false, allowDelete: false }
    const seed = await install(
      target.workspaceId,
      source.workspaceId,
      { minigames: (await collectFrom(source.workspaceId)).minigames },
      view,
    )
    const [copy] = await db.query.minigameModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    await expect(
      minigameService.updatePartial({
        workspaceId: target.workspaceId,
        id: copy.id,
        generalSettings: { ...copy.generalSettings, name: "Renamed" },
      }),
    ).rejects.toBeInstanceOf(Error)
    // The toggle is the installer's.
    await expect(
      minigameService.setEnabled(
        { workspaceId: target.workspaceId, id: copy.id },
        false,
      ),
    ).resolves.toMatchObject({ enabled: false })

    await templateUninstallService.uninstallAsInstaller({
      workspaceId: target.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.run({
      ...claim,
      workspaceId: target.workspaceId,
    })
    expect(
      await db.query.minigameModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
  })

  test("duplicating a copy is refused once its uninstall started, and leaves no new row behind", async () => {
    const source = track(await seedWorkspace("tools-g2-dup-src"))
    const target = track(await seedWorkspace("tools-g2-dup-dst"))
    await minigameService.create(
      minigameInput(source.workspaceId, "Lucky draw"),
    )
    const seed = await install(
      target.workspaceId,
      source.workspaceId,
      { minigames: (await collectFrom(source.workspaceId)).minigames },
      { allowEdit: true, allowDelete: true },
    )
    const [copy] = await db.query.minigameModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    // Before the uninstall a duplicate works (and is a plain, unlinked row).
    await expect(
      minigameService.duplicate({
        workspaceId: target.workspaceId,
        id: copy.id,
      }),
    ).resolves.toMatchObject({ enabled: false })

    await templateUninstallService.uninstallAsInstaller({
      workspaceId: target.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })
    // Phase A (decide, freeze, tombstone) only, as in a crash before Phase B.
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.decide({
      ...claim,
      workspaceId: target.workspaceId,
    })
    const before = await db.query.minigameModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    await expect(
      minigameService.duplicate({
        workspaceId: target.workspaceId,
        id: copy.id,
      }),
    ).rejects.toMatchObject({ code: "templateUninstallInProgress" })
    expect(
      await db.query.minigameModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(before.length)
  })

  test("an uninstall hard-deletes the leaderboard copy before its minigame, which would otherwise stay referenced", async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    const minigame = await minigameService.create(
      minigameInput(source.workspaceId, "Lucky draw"),
    )
    await leaderboardService.insertDraftInTx(db, {
      workspaceId: source.workspaceId,
      name: "Top players",
      description: "",
      coverImageUrl: "",
      startsAt: new Date("2099-01-01T00:00:00.000Z"),
      endsAt: new Date("2099-02-01T00:00:00.000Z"),
      platform: "gamification",
      inboxId: null,
      minigameId: minigame.id,
      scope: { postScope: "all", postIds: [], telegramChatIds: [] },
      rules: leaderboardService.defaultRules("gamification"),
      followersOnly: false,
      tagIds: [],
      resetTime: "22:00",
      cooldownSeconds: 0,
      referralWelcomeFlowId: null,
      rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
    })
    const collected = await collectFrom(source.workspaceId)
    const seed = await install(target.workspaceId, source.workspaceId, {
      minigames: collected.minigames,
      leaderboards: collected.leaderboards,
    })

    await templateUninstallService.uninstallAsInstaller({
      workspaceId: target.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.run({
      ...claim,
      workspaceId: target.workspaceId,
    })

    expect(
      await db.query.leaderboardModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
    expect(
      await db.query.minigameModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
  })

  const leaderboardDraft = (
    workspaceId: string,
    minigameId: string,
    referralWelcomeFlowId: string | null,
  ) => ({
    workspaceId,
    name: "Top players",
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
    referralWelcomeFlowId,
    rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
  })

  const uninstallAll = async (seed: {
    workspaceId: string
    installationId: string
  }) => {
    await templateUninstallService.uninstallAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.run({
      ...claim,
      workspaceId: seed.workspaceId,
    })
  }

  const installLeaderboardWithFlow = async (label: string) => {
    const source = track(await seedWorkspace(`${label}-src`))
    const target = track(await seedWorkspace(`${label}-dst`))
    const minigame = await minigameService.create(
      minigameInput(source.workspaceId, "Lucky draw"),
    )
    await leaderboardService.insertDraftInTx(
      db,
      leaderboardDraft(source.workspaceId, minigame.id, null),
    )
    const collected = await collectFrom(source.workspaceId)
    const leaderboards = (
      collected.leaderboards as { referralWelcomeFlowId: string | null }[]
    ).map((entry) => ({ ...entry, referralWelcomeFlowId: "801" }))
    const flows = [
      {
        sourceId: "801",
        name: "Welcome",
        active: true,
        enableInInbox: true,
        startNodeId: "8010",
        nodes: [],
        edges: [],
        folderId: null,
      },
    ]
    const seed = await install(target.workspaceId, source.workspaceId, {
      flows,
      minigames: collected.minigames,
      leaderboards,
    })
    return { target, seed }
  }

  test("creating a minigame or leaderboard that points at a flow being uninstalled is refused, leaving nothing behind", async () => {
    const { target, seed } = await installLeaderboardWithFlow("tools-g2-mkr")
    const [flow] = await db.query.flowModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    await templateUninstallService.uninstallAsInstaller({
      workspaceId: target.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    // Phase A only: the flow is tombstoned but still there, as in a race.
    await templateUninstallExecuteService.decide({
      ...claim,
      workspaceId: target.workspaceId,
    })
    const minigames = await db.query.minigameModel.findMany({
      where: { workspaceId: target.workspaceId },
    })

    const base = minigameInput(target.workspaceId, "Fresh")
    await expect(
      minigameService.create({
        ...base,
        playerSettings: minigamePlayerSettingsSchema.parse({
          resetPolicy: "never",
          sharingFlowId: flow.id,
        }),
      }),
    ).rejects.toMatchObject({ code: "templateUninstallInProgress" })
    await expect(
      leaderboardService.create(
        {
          ...leaderboardDraft(target.workspaceId, minigames[0].id, null),
          rewardSettings: { flowId: flow.id, topN: 3, autoOnFinish: false },
        } as never,
        {},
      ),
    ).rejects.toMatchObject({ code: "templateUninstallInProgress" })

    expect(
      await db.query.minigameModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(minigames.length)
  })

  test("an uninstall removes a leaderboard together with its referral welcome flow", async () => {
    const { target, seed } = await installLeaderboardWithFlow("tools-g2-lbf")
    expect(
      (
        await db.query.leaderboardModel.findMany({
          where: { workspaceId: target.workspaceId },
        })
      ).map((row) => row.referralWelcomeFlowId),
    ).not.toContain(null)

    await uninstallAll(seed)

    expect(
      await db.query.flowModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
    expect(
      await db.query.leaderboardModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
  })

  test("a leaderboard the installer made on the copied flow keeps that flow, a soft-deleted one does not", async () => {
    const { target, seed } = await installLeaderboardWithFlow("tools-g2-lbk")
    const [flow] = await db.query.flowModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    const [copy] = await db.query.minigameModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    const own = await leaderboardService.insertDraftInTx(
      db,
      leaderboardDraft(target.workspaceId, copy.id, flow.id),
    )

    await uninstallAll(seed)
    expect(
      (
        await db.query.flowModel.findMany({
          where: { workspaceId: target.workspaceId },
        })
      ).map((row) => row.id),
    ).toEqual([flow.id])
    expect(
      (
        await db.query.leaderboardModel.findMany({
          where: { workspaceId: target.workspaceId },
        })
      ).map((row) => row.id),
    ).toEqual([own.id])
  })

  test("a leaderboard the installer soft-deleted no longer keeps the template's minigame installed", async () => {
    const source = track(await seedWorkspace("tools-g2-src"))
    const target = track(await seedWorkspace("tools-g2-dst"))
    await minigameService.create(
      minigameInput(source.workspaceId, "Lucky draw"),
    )
    const seed = await install(target.workspaceId, source.workspaceId, {
      minigames: (await collectFrom(source.workspaceId)).minigames,
    })
    const [copy] = await db.query.minigameModel.findMany({
      where: { workspaceId: target.workspaceId },
    })
    // The installer builds their own leaderboard on the copy, then deletes it (a soft delete).
    const own = await leaderboardService.insertDraftInTx(db, {
      workspaceId: target.workspaceId,
      name: "Mine",
      description: "",
      coverImageUrl: "",
      startsAt: new Date("2099-01-01T00:00:00.000Z"),
      endsAt: new Date("2099-02-01T00:00:00.000Z"),
      platform: "gamification",
      inboxId: null,
      minigameId: copy.id,
      scope: { postScope: "all", postIds: [], telegramChatIds: [] },
      rules: leaderboardService.defaultRules("gamification"),
      followersOnly: false,
      tagIds: [],
      resetTime: "22:00",
      cooldownSeconds: 0,
      referralWelcomeFlowId: null,
      rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
    })
    await db
      .update(leaderboardModel)
      .set({ deletedAt: new Date() })
      .where(eq(leaderboardModel.id, own.id))

    await templateUninstallService.uninstallAsInstaller({
      workspaceId: target.workspaceId,
      installationId: seed.installationId,
      actor: FULL,
    })
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.run({
      ...claim,
      workspaceId: target.workspaceId,
    })

    expect(
      await db.query.minigameModel.findMany({
        where: { workspaceId: target.workspaceId },
      }),
    ).toHaveLength(0)
  })
  test("a leaderboard uninstall drains participants and the audit log in bounded batches, never by cascade", async () => {
    const seed = track(await seedWorkspace("tools-g2-board"))
    const minigame = await minigameService.create(
      minigameInput(seed.workspaceId, "Lucky draw"),
    )
    const board = await leaderboardService.insertDraftInTx(db, {
      workspaceId: seed.workspaceId,
      name: "Top players",
      description: "",
      coverImageUrl: "",
      startsAt: new Date("2099-01-01T00:00:00.000Z"),
      endsAt: new Date("2099-02-01T00:00:00.000Z"),
      platform: "gamification",
      inboxId: null,
      minigameId: minigame.id,
      scope: { postScope: "all", postIds: [], telegramChatIds: [] },
      rules: leaderboardService.defaultRules("gamification"),
      followersOnly: false,
      tagIds: [],
      resetTime: "22:00",
      cooldownSeconds: 0,
      referralWelcomeFlowId: null,
      rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
    })
    // One more than a drain batch (500), so a single statement cannot take them all.
    const contacts = await db
      .insert(contactModel)
      .values(
        Array.from({ length: 501 }, (_, index) => ({
          id: createId(),
          workspaceId: seed.workspaceId,
          firstName: `P${index}`,
        })),
      )
      .returning({ id: contactModel.id })
    await db.insert(leaderboardParticipantModel).values(
      contacts.map((contact) => ({
        leaderboardId: board.id,
        contactId: contact.id,
        workspaceId: seed.workspaceId,
        dailyCounts: {},
        breakdown: {},
      })) as never,
    )
    await db.insert(leaderboardAuditLogModel).values({
      leaderboardId: board.id,
      workspaceId: seed.workspaceId,
      action: "resetAll",
    } as never)

    const handler = UNINSTALL_HANDLER_BY_KIND.leaderboard
    expect(handler?.heavyChildren).toEqual(
      expect.arrayContaining([
        "LeaderboardScoreEvent",
        "LeaderboardParticipant",
        "LeaderboardAuditLog",
      ]),
    )
    const countParticipants = async () =>
      (
        await db.query.leaderboardParticipantModel.findMany({
          where: { leaderboardId: board.id },
          columns: { contactId: true },
        })
      ).length
    const rounds: boolean[] = []
    const remaining: number[] = []
    await db.transaction(async (tx) => {
      const ctx = uninstallContext(tx, seed.workspaceId, "1", "leaderboard")
      for (let round = 0; round < 5; round += 1) {
        const more = await handler?.drainHeavyChildren?.(tx, [board.id], ctx)
        rounds.push(Boolean(more))
        remaining.push(
          (
            await tx.query.leaderboardParticipantModel.findMany({
              where: { leaderboardId: board.id },
              columns: { contactId: true },
            })
          ).length,
        )
        if (!more) {
          break
        }
      }
    })

    // The first batch is full (more may remain), the second finishes.
    expect(rounds).toEqual([true, false])
    expect(remaining).toEqual([1, 0])
    expect(await countParticipants()).toBe(0)
    expect(
      await db.query.leaderboardAuditLogModel.findMany({
        where: { leaderboardId: board.id },
        columns: { id: true },
      }),
    ).toEqual([])
  })

  test("the uninstall image scan reports only the images another minigame of the workspace still shows", async () => {
    const seed = track(await seedWorkspace("tools-g2-images"))
    const other = track(await seedWorkspace("tools-g2-images-other"))
    const image = (url: string) => ({ mode: "url" as const, url })
    const withImages = (
      workspaceId: string,
      name: string,
      urls: { background?: string; lose?: string; icon?: string },
    ) => {
      const base = minigameInput(workspaceId, name)
      return {
        ...base,
        appearance: minigameAppearanceSchema.parse({
          backgroundImage: image(urls.background ?? ""),
          prizeDescriptionImage: {},
          startButtonImage: {},
        }),
        prizeSettings: minigamePrizeSettingsSchema.parse({
          prizes: [
            {
              id: "prize-1",
              name: "Coffee",
              winRate: 40,
              quantity: 7,
              icon: image(urls.icon ?? ""),
            },
          ],
          nonWinning: {
            title: "Next time",
            loseRate: 60,
            loseImage: image(urls.lose ?? ""),
          },
        }),
      }
    }
    const deleting = await minigameService.create(
      withImages(seed.workspaceId, "Deleting", {
        background: "https://img.test/shared-bg.png",
        lose: "https://img.test/own-lose.png",
        icon: "https://img.test/shared-icon.png",
      }),
    )
    await minigameService.create(
      withImages(seed.workspaceId, "Sibling", {
        background: "https://img.test/shared-bg.png",
        icon: "https://img.test/own-lose.png-not-the-same",
        lose: "https://img.test/shared-icon.png",
      }),
    )
    // Another workspace showing the unshared image does not keep it.
    await minigameService.create(
      withImages(other.workspaceId, "Elsewhere", {
        background: "https://img.test/own-lose.png",
      }),
    )

    const used = await minigameRepository.findImageUrlsUsedByOthers({
      workspaceId: seed.workspaceId,
      excludeIds: [deleting.id],
      urls: [
        "https://img.test/shared-bg.png",
        "https://img.test/own-lose.png",
        "https://img.test/shared-icon.png",
      ],
    })

    expect([...used].sort()).toEqual([
      "https://img.test/shared-bg.png",
      "https://img.test/shared-icon.png",
    ])
    expect(
      await minigameRepository.findImageUrlsUsedByOthers({
        workspaceId: seed.workspaceId,
        excludeIds: [deleting.id],
        urls: [],
      }),
    ).toEqual(new Set())
  })
})
