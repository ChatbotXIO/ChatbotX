// @vitest-environment node

/**
 * The G1 tools (magic links, polls, place locations) installed against a real
 * Postgres: the copies exist with their history left out, a renamed magic link
 * is followed by the text that points at it, and the service's own `update`
 * accepts every copy (the round trip that catches a copy the service would
 * refuse to save).
 *
 * Commits for real (the install runs its own transaction), so each test
 * deletes its workspace — everything cascades from it — afterwards.
 * Needs the template migrations applied to the local database.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import {
  pollModel,
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

// The request enqueues a job; the test drives the executor itself, and the
// post-commit effects need Redis and storage (an unregistered effect is skipped).
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
const { templateInstallService } = await import(
  "../../src/template/install.service"
)
const { magicLinkService } = await import("../../src/magic-link/service")
const { pollService } = await import("../../src/poll/service")
const { placeLocationService } = await import(
  "../../src/place-near-me/location.service"
)

const databaseUrl = realDatabaseUrl()
const SOURCE_WORKSPACE_ID = "999000"

const flowEntry = (sourceId: string, name: string) => ({
  sourceId,
  name,
  active: true,
  enableInInbox: true,
  startNodeId: `${sourceId}0`,
  nodes: [],
  edges: [],
  folderId: null,
})

const buildPayload = () => {
  const parsed = parseTemplateExport({
    formatVersion: 3,
    exportedAt: new Date().toISOString(),
    source: { workspaceId: SOURCE_WORKSPACE_ID, tenantId: "1" },
    manifests: { placeCategories: { "50": { name: "Cafes" } } },
    resources: {
      flows: [flowEntry("801", "Welcome")],
      keywords: [
        {
          sourceId: "901",
          type: "inbound",
          keywords: ["promo"],
          text: `Open https://app.example/r/${SOURCE_WORKSPACE_ID}/promo?x=1`,
          flowId: null,
          folderId: null,
        },
      ],
      magicLinks: [
        { sourceId: "11", name: "promo", url: "https://shop.example/sale" },
      ],
      polls: [
        {
          sourceId: "12",
          name: "Favourite",
          imageUrl: "https://cdn.example/cover.png",
          startsAt: "2099-01-01T00:00:00.000Z",
          endsAt: "2099-02-01T00:00:00.000Z",
          afterVoteFlowId: "801",
          candidates: [
            {
              name: "A",
              // Polls install before magic links: the link follows in Phase 2.
              description: `Details: https://app.example/r/${SOURCE_WORKSPACE_ID}/promo`,
              imageUrl: null,
            },
            { name: "B", description: null, imageUrl: null },
          ],
        },
      ],
      placeLocations: [
        {
          sourceId: "13",
          name: "Main street",
          latitude: 10.5,
          longitude: 106.7,
          categoryId: "50",
        },
      ],
    },
  })
  if (!parsed.ok) {
    throw new Error(parsed.reason)
  }
  return parsed.data
}

describe.skipIf(!databaseUrl)("template tools (G1) on a real database", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seedInstall = async (
    permissions = { allowEdit: true, allowDelete: true },
  ) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `template-tools-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `template-tools-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: workspace.id,
        tenantId: "1",
        name: "Template",
        selection: { mode: "all" } as never,
        payload: {},
        categoryCounts: {},
        formatVersion: 3,
        shareToken: `tok-${suffix}`,
        defaultPermissions: permissions,
      })
      .returning({ id: templateModel.id })
    const installation = await templateInstallationRepository.create({
      workspaceId: workspace.id,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: "Template",
      sourceWorkspaceId: SOURCE_WORKSPACE_ID,
      formatVersion: 3,
      status: "pending",
      permissions,
    })
    return { workspaceId: workspace.id, installationId: installation.id }
  }

  const runInstall = async (
    seed: { workspaceId: string; installationId: string },
    permissions = { allowEdit: true, allowDelete: true },
  ) => {
    const claim = await templateInstallService.claim(seed)
    if (!claim) {
      throw new Error("the install could not be claimed")
    }
    await templateInstallService.run({
      installationId: seed.installationId,
      workspaceId: seed.workspaceId,
      claimToken: claim.claimToken,
      permissions,
      payload: buildPayload(),
      templateName: "Template",
      createInstallFolder: false,
      sourceVersion: 1,
    })
  }

  test("copies the tools, renames a taken magic link and rewrites the text that points at it", async () => {
    const seed = await seedInstall()
    await magicLinkService.create({
      workspaceId: seed.workspaceId,
      data: { name: "promo", url: "https://mine.example" },
    })

    await runInstall(seed)

    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: seed.installationId,
        workspaceId: seed.workspaceId,
      })
    // The fixture flow is a draft; nothing about the tools themselves warns.
    expect(installation?.warnings.map((warning) => warning.entityKind)).toEqual(
      ["flowNotPublished"],
    )

    const links = await db.query.magicLinkModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(links.map((link) => link.name).sort()).toEqual([
      "promo",
      "promo-copy",
    ])

    const [keyword] = await db.query.automatedResponseModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(keyword.text).toBe(
      `Open https://app.example/r/${seed.workspaceId}/promo-copy?x=1`,
    )

    const [poll] = await db.query.pollModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    const [flow] = await db.query.flowModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(poll.afterVoteFlowId).toBe(flow.id)
    const candidates = await db.query.pollCandidateModel.findMany({
      where: { pollId: poll.id },
    })
    expect(candidates).toHaveLength(2)
    expect(
      candidates.find((candidate) => candidate.name === "A")?.description,
    ).toBe(`Details: https://app.example/r/${seed.workspaceId}/promo-copy`)
    const votes = await db.query.pollVoteModel.findMany({
      where: { pollId: poll.id },
    })
    expect(votes).toHaveLength(0)

    const [location] = await db.query.placeLocationModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    const [category] = await db.query.placeCategoryModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(location.categoryId).toBe(category.id)
    expect(category.name).toBe("Cafes")
  })

  test("the service's own update accepts every copy", async () => {
    const seed = await seedInstall()
    await runInstall(seed)

    const [link] = await db.query.magicLinkModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    const [poll] = await db.query.pollModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    const [location] = await db.query.placeLocationModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })

    await expect(
      magicLinkService.update({
        workspaceId: seed.workspaceId,
        id: link.id,
        data: { url: link.url },
      }),
    ).resolves.toMatchObject({ id: link.id })
    await expect(
      pollService.update({
        workspaceId: seed.workspaceId,
        id: poll.id,
        data: { name: poll.name },
      }),
    ).resolves.toMatchObject({ id: poll.id })
    await expect(
      placeLocationService.update({
        workspaceId: seed.workspaceId,
        locationId: location.id,
        data: { name: location.name },
      }),
    ).resolves.toMatchObject({ id: location.id })
  })

  test("an uninstall removes the copies, their candidates and the link, and keeps the installer's own", async () => {
    const seed = await seedInstall()
    await magicLinkService.create({
      workspaceId: seed.workspaceId,
      data: { name: "promo", url: "https://mine.example" },
    })
    await runInstall(seed)

    await templateUninstallService.uninstallAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: { kind: "apiToken", permission: "full" },
    })
    const claim = await templateUninstallExecuteService.claim(seed)
    if (!claim) {
      throw new Error("the uninstall could not be claimed")
    }
    await templateUninstallExecuteService.run({
      ...claim,
      workspaceId: seed.workspaceId,
    })

    const links = await db.query.magicLinkModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(links.map((link) => link.name)).toEqual(["promo"])
    expect(
      await db.query.pollModel.findMany({
        where: { workspaceId: seed.workspaceId },
      }),
    ).toHaveLength(0)
    expect(
      await db.query.pollCandidateModel.findMany({
        where: { workspaceId: seed.workspaceId },
      }),
    ).toHaveLength(0)
    expect(
      await db.query.placeLocationModel.findMany({
        where: { workspaceId: seed.workspaceId },
      }),
    ).toHaveLength(0)
  })

  const uninstallAll = async (seed: {
    workspaceId: string
    installationId: string
  }) => {
    await templateUninstallService.uninstallAsInstaller({
      workspaceId: seed.workspaceId,
      installationId: seed.installationId,
      actor: { kind: "apiToken", permission: "full" },
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

  test("an uninstall removes a poll together with the flow it runs after a vote", async () => {
    const seed = await seedInstall()
    await runInstall(seed)

    await uninstallAll(seed)

    expect(
      await db.query.flowModel.findMany({
        where: { workspaceId: seed.workspaceId },
      }),
    ).toHaveLength(0)
    expect(
      await db.query.pollModel.findMany({
        where: { workspaceId: seed.workspaceId },
      }),
    ).toHaveLength(0)
  })

  test("a poll the installer made on the copied flow keeps that flow", async () => {
    const seed = await seedInstall()
    await runInstall(seed)
    const [flow] = await db.query.flowModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    await db.insert(pollModel).values({
      workspaceId: seed.workspaceId,
      name: "Mine",
      imageUrl: "https://cdn.example/mine.png",
      startsAt: new Date("2099-01-01T00:00:00.000Z"),
      endsAt: new Date("2099-02-01T00:00:00.000Z"),
      afterVoteFlowId: flow.id,
    })

    await uninstallAll(seed)

    const kept = await db.query.flowModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(kept.map((row) => row.id)).toEqual([flow.id])
    const polls = await db.query.pollModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(polls.map((row) => row.name)).toEqual(["Mine"])
    expect(polls[0].afterVoteFlowId).toBe(flow.id)
  })

  test("a View-only install refuses to edit the copies' content, and the delete", async () => {
    const view = { allowEdit: false, allowDelete: false }
    const seed = await seedInstall(view)
    await runInstall(seed, view)

    const [link] = await db.query.magicLinkModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    const [poll] = await db.query.pollModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    const [location] = await db.query.placeLocationModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })

    await expect(
      magicLinkService.update({
        workspaceId: seed.workspaceId,
        id: link.id,
        data: { name: "renamed" },
      }),
    ).rejects.toBeInstanceOf(Error)
    await expect(
      pollService.update({
        workspaceId: seed.workspaceId,
        id: poll.id,
        data: { name: "renamed" },
      }),
    ).rejects.toBeInstanceOf(Error)
    await expect(
      placeLocationService.update({
        workspaceId: seed.workspaceId,
        locationId: location.id,
        data: { name: "renamed" },
      }),
    ).rejects.toBeInstanceOf(Error)
    await expect(
      pollService.delete({ workspaceId: seed.workspaceId, id: poll.id }),
    ).rejects.toBeInstanceOf(Error)
    // Nothing stuck.
    const [still] = await db.query.pollModel.findMany({
      where: { workspaceId: seed.workspaceId },
    })
    expect(still.name).toBe("Favourite")
  })
})
