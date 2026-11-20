// @vitest-environment node

/**
 * The service round trip on a real Postgres: a copy installed from a template
 * must be accepted by its service's NORMAL `update` with unchanged data (the
 * leaderboard-without-inbox bug was exactly a copy the service then refused).
 * Covers the kinds the other tool suites do not: leaderboard, minigame,
 * openHours, vendor, discountCode and storeSettings (magic link, poll, place
 * location, Mini App, dynamic image are round-tripped in the G1 and G2 suites).
 *
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
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import {
  inboxModel,
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

const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { minigameService } = await import("../../src/minigame/service")
const { leaderboardService } = await import("../../src/leaderboard/service")
const { ecommerceOpenHoursService } = await import(
  "../../src/ecommerce-open-hours/service"
)
const { vendorService } = await import("../../src/vendor/service")
const { discountCodeService } = await import("../../src/discount-code/service")
const { ecommerceSettingsService } = await import(
  "../../src/ecommerce-settings/service"
)
const { minigamesAdapter } = await import(
  "../../src/template/adapters/minigames"
)
const { openHoursAdapter } = await import(
  "../../src/template/adapters/open-hours"
)
const { vendorsAdapter } = await import("../../src/template/adapters/vendors")
const { discountCodesAdapter } = await import(
  "../../src/template/adapters/discount-codes"
)
const { storeSettingsAdapter } = await import(
  "../../src/template/adapters/store-settings"
)

const databaseUrl = realDatabaseUrl()
const SOURCE_INBOX_ID = "5001"

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

describe.skipIf(!databaseUrl)(
  "template copies round-trip their service's update",
  () => {
    const created: { workspaceId: string; userId: string }[] = []

    afterEach(async () => {
      for (const { workspaceId, userId } of created.splice(0)) {
        await db
          .delete(workspaceModel)
          .where(eq(workspaceModel.id, workspaceId))
        await db.delete(userModel).where(eq(userModel.id, userId))
      }
    })

    const track = (seed: { workspaceId: string; userId: string }) => {
      created.push(seed)
      return seed
    }

    const collectFrom = async (
      sourceWorkspaceId: string,
      adapters: Record<
        string,
        {
          collector: {
            resolveIds: (w: string, limit: number) => Promise<string[]>
            collect: (
              w: string,
              ids: string[],
            ) => Promise<{ entries: readonly unknown[] }>
          }
        }
      >,
    ) => {
      const result: Record<string, readonly unknown[]> = {}
      for (const [category, adapter] of Object.entries(adapters)) {
        result[category] = (
          await adapter.collector.collect(
            sourceWorkspaceId,
            await adapter.collector.resolveIds(sourceWorkspaceId, 100),
          )
        ).entries
      }
      return result
    }

    const install = async (
      targetWorkspaceId: string,
      sourceWorkspaceId: string,
      resources: Record<string, unknown>,
      options: {
        manifests?: Record<string, unknown>
        inboxBindings?: Record<string, string>
      } = {},
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
        manifests: options.manifests ?? {},
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
        inboxBindings: options.inboxBindings,
      })
      return seed
    }

    const warningsOf = async (seed: {
      workspaceId: string
      installationId: string
    }) =>
      (
        await templateInstallationRepository.findByIdAndWorkspace({
          id: seed.installationId,
          workspaceId: seed.workspaceId,
        })
      )?.warnings.map((warning) => warning.entityKind) ?? []

    const seedMessengerInbox = async (workspaceId: string) => {
      const [inbox] = await db
        .insert(inboxModel)
        .values({
          id: createId(),
          workspaceId,
          name: "Page",
          channel: "messenger",
          sourceId: `page-${createId()}`,
        } as never)
        .returning({ id: inboxModel.id })
      return inbox.id
    }

    const leaderboardEntry = () => ({
      sourceId: "900",
      name: "Messenger board",
      description: "",
      coverImageUrl: "",
      startsAt: "2099-01-01T00:00:00.000Z",
      endsAt: "2099-02-01T00:00:00.000Z",
      platform: "messenger",
      inboxSourceId: SOURCE_INBOX_ID,
      minigameId: null,
      scope: { postScope: "all", postIds: [], telegramChatIds: [] },
      rules: leaderboardService.defaultRules("messenger"),
      followersOnly: false,
      tagIds: [],
      resetTime: "22:00",
      cooldownSeconds: 0,
      referralWelcomeFlowId: null,
      rewardSettings: { flowId: null, topN: 3, autoOnFinish: false },
    })

    const inboxManifest = {
      inboxes: {
        [SOURCE_INBOX_ID]: { channelType: "messenger", name: "Page" },
      },
    }

    test("a leaderboard copy installed as a draft with its inbox bound is accepted by the service's update", async () => {
      const source = track(await seedWorkspace("rt-src"))
      const target = track(await seedWorkspace("rt-dst"))
      const inboxId = await seedMessengerInbox(target.workspaceId)
      await install(
        target.workspaceId,
        source.workspaceId,
        { leaderboards: [leaderboardEntry()] },
        {
          manifests: inboxManifest,
          inboxBindings: { [SOURCE_INBOX_ID]: inboxId },
        },
      )

      const [copy] = await db.query.leaderboardModel.findMany({
        where: { workspaceId: target.workspaceId },
      })
      expect(copy.status).toBe("draft")
      expect(copy.inboxId).toBe(inboxId)
      const unchanged = {
        workspaceId: target.workspaceId,
        id: copy.id,
        name: copy.name,
        description: copy.description,
        coverImageUrl: copy.coverImageUrl,
        startsAt: copy.startsAt,
        endsAt: copy.endsAt,
        platform: copy.platform,
        inboxId: copy.inboxId,
        minigameId: copy.minigameId,
        scope: copy.scope,
        rules: copy.rules,
        followersOnly: copy.followersOnly,
        tagIds: copy.tagIds,
        resetTime: copy.resetTime,
        cooldownSeconds: copy.cooldownSeconds,
        referralWelcomeFlowId: copy.referralWelcomeFlowId,
        rewardSettings: copy.rewardSettings,
      }
      await expect(leaderboardService.update(unchanged)).resolves.toMatchObject(
        {
          id: copy.id,
        },
      )

      // A draft can still be moved to another inbox of the channel.
      const otherInbox = await seedMessengerInbox(target.workspaceId)
      await expect(
        leaderboardService.update({ ...unchanged, inboxId: otherInbox }),
      ).resolves.toMatchObject({ inboxId: otherInbox })
    })

    test("a leaderboard whose inbox was not bound is never installed, so no copy exists to refuse an update", async () => {
      const source = track(await seedWorkspace("rt-src"))
      const target = track(await seedWorkspace("rt-dst"))
      const seed = await install(
        target.workspaceId,
        source.workspaceId,
        { leaderboards: [leaderboardEntry()] },
        { manifests: inboxManifest },
      )
      expect(
        await db.query.leaderboardModel.findMany({
          where: { workspaceId: target.workspaceId },
        }),
      ).toHaveLength(0)
      expect(await warningsOf(seed)).toContain("leaderboardHostMissing")
    })

    test("a minigame copy is accepted by the service's update and partial update", async () => {
      const source = track(await seedWorkspace("rt-src"))
      const target = track(await seedWorkspace("rt-dst"))
      await minigameService.create(
        minigameInput(source.workspaceId, "Lucky draw"),
      )
      await install(
        target.workspaceId,
        source.workspaceId,
        await collectFrom(source.workspaceId, { minigames: minigamesAdapter }),
      )
      const [copy] = await db.query.minigameModel.findMany({
        where: { workspaceId: target.workspaceId },
      })
      await expect(
        minigameService.update({
          workspaceId: target.workspaceId,
          id: copy.id,
          type: copy.type,
          generalSettings: copy.generalSettings,
          appearance: copy.appearance,
          playerSettings: copy.playerSettings,
          prizeSettings: copy.prizeSettings,
          winningMessageSettings: copy.winningMessageSettings,
          nonWinningMessageSettings: copy.nonWinningMessageSettings,
        }),
      ).resolves.toMatchObject({ id: copy.id })
      await expect(
        minigameService.updatePartial({
          workspaceId: target.workspaceId,
          id: copy.id,
          generalSettings: copy.generalSettings,
        }),
      ).resolves.toMatchObject({ id: copy.id })
    })

    const seedStore = async (workspaceId: string) => {
      const hours = await ecommerceOpenHoursService.create({
        workspaceId,
        name: "Weekdays",
        ranges: [{ day: 1, from: "09:00", to: "17:00" }],
      })
      await vendorService.create({
        workspaceId,
        name: "Acme",
        phone: "123",
        isActive: true,
        openHoursId: hours.id,
      } as never)
      await discountCodeService.create({
        workspaceId,
        code: "SAVE10",
        autoApply: true,
        discountType: "percentage",
        discountValue: 10,
        appliesTo: "entireOrder",
        categoryId: null,
        productIds: [],
        minimumType: "none",
        minimumValue: 0,
        usageLimit: null,
        oncePerCustomer: false,
        eligibility: "everyone",
        customerFilter: null,
        startsAt: new Date("2020-01-01T00:00:00.000Z"),
        endsAt: null,
        isActive: true,
      })
      await ecommerceSettingsService.update({
        workspaceId,
        patch: { general: { orderingAvailable: true, openHoursId: hours.id } },
      })
    }

    test("open hours, vendor, discount code and store settings copies are accepted by their services' update", async () => {
      const source = track(await seedWorkspace("rt-src"))
      const target = track(await seedWorkspace("rt-dst"))
      await seedStore(source.workspaceId)
      await install(
        target.workspaceId,
        source.workspaceId,
        await collectFrom(source.workspaceId, {
          openHours: openHoursAdapter,
          vendors: vendorsAdapter,
          discountCodes: discountCodesAdapter,
          storeSettings: storeSettingsAdapter,
        }),
      )

      const [hours] = await db.query.ecommerceOpenHoursModel.findMany({
        where: { workspaceId: target.workspaceId },
      })
      await expect(
        ecommerceOpenHoursService.update({
          workspaceId: target.workspaceId,
          openHoursId: hours.id,
          data: { name: hours.name, ranges: hours.ranges },
        }),
      ).resolves.toMatchObject({ id: hours.id })

      const [vendor] = await db.query.vendorModel.findMany({
        where: { workspaceId: target.workspaceId },
      })
      await expect(
        vendorService.update({
          workspaceId: target.workspaceId,
          vendorId: vendor.id,
          data: { name: vendor.name, phone: vendor.phone },
        }),
      ).resolves.toMatchObject({ id: vendor.id })

      const [code] = await db.query.discountCodeModel.findMany({
        where: { workspaceId: target.workspaceId },
      })
      await expect(
        discountCodeService.update({
          workspaceId: target.workspaceId,
          discountCodeId: code.id,
          data: { discountValue: code.discountValue },
        }),
      ).resolves.toMatchObject({ id: code.id })

      await expect(
        ecommerceSettingsService.update({
          workspaceId: target.workspaceId,
          patch: { general: { orderingAvailable: true } },
        }),
      ).resolves.toBeDefined()
    })
  },
)
