// @vitest-environment node

/**
 * The inbox "Opted In through" feed against a real Postgres: each kind's rule,
 * the unique `(occurredAt, kind, resourceKey)` order, exact counts for a busy
 * resource, parent scoping for tables without `workspaceId`, and the
 * magic-link index migration being re-runnable after an invalid build.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"
import type { ContactTouchpointKind } from "../../src/partials/contact-touchpoint"
import { relations } from "../../src/relations"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

type World = {
  contactId: string
  contactInboxId: string
  inboxId: string
  otherWorkspaceId: string
  userId: string
  workspaceId: string
}

let sequence = 0
/** Unique bigint ids: the tables generate theirs in application code. */
const newId = (): string =>
  String(BigInt(Date.now()) * 1_000_000n + BigInt(++sequence))

const at = (isoSeconds: string): Date => new Date(`${isoSeconds}Z`)

describe.skipIf(!databaseUrl)("contact touchpoint repository", async () => {
  const { contactTouchpointRepository } = await import(
    "../../src/repositories/contact-touchpoint/repository"
  )
  let client: Client
  let world: World

  const insert = async (table: string, row: Record<string, unknown>) => {
    const columns = Object.keys(row)
    await client.query(
      `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`,
      columns.map((column) => {
        const value = row[column]
        return value !== null &&
          typeof value === "object" &&
          !(value instanceof Date)
          ? JSON.stringify(value)
          : value
      }),
    )
  }

  const list = (
    overrides: Partial<
      Parameters<typeof contactTouchpointRepository.listByContact>[0]
    > = {},
  ) =>
    contactTouchpointRepository.listByContact({
      workspaceId: world.workspaceId,
      contactId: world.contactId,
      limit: 100,
      ...overrides,
    })

  const byKind = async (kind: ContactTouchpointKind) =>
    (await list({ kinds: [kind] })).filter((row) => row.kind === kind)

  const seedMinigame = async (workspaceId: string, name: string) => {
    const minigameId = newId()
    await insert("Minigame", {
      id: minigameId,
      workspaceId,
      name,
      type: "luckyWheel",
      generalSettings: {},
      appearance: {},
      playerSettings: {},
      prizeSettings: {},
      winningMessageSettings: {},
      nonWinningMessageSettings: {},
    })
    return minigameId
  }

  const seedMagicLink = async (name: string) => {
    const linkId = newId()
    await insert("MagicLink", {
      id: linkId,
      workspaceId: world.workspaceId,
      name,
      url: "https://example.test",
    })
    return linkId
  }

  const seedMagicStat = (linkId: string, occurredAt: Date | string) =>
    insert("MagicLinkStat", {
      workspaceId: world.workspaceId,
      linkId,
      contactId: world.contactId,
      contactInboxId: world.contactInboxId,
      occurredAt,
    })

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl ?? undefined })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  beforeEach(async () => {
    const db = drizzle({ client, relations, schema })
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `touchpoint-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace, otherWorkspace] = await db
      .insert(schema.workspaceModel)
      .values([
        { name: `touchpoint-a-${suffix}`, ownerId: user.id },
        { name: `touchpoint-b-${suffix}`, ownerId: user.id },
      ])
      .returning({ id: schema.workspaceModel.id })
    const [inbox] = await db
      .insert(schema.inboxModel)
      .values({
        channel: "instagram",
        name: `Instagram ${suffix}`,
        sourceId: `instagram-${suffix}`,
        workspaceId: workspace.id,
      })
      .returning({ id: schema.inboxModel.id })
    const [contact] = await db
      .insert(schema.contactModel)
      .values({ workspaceId: workspace.id })
      .returning({ id: schema.contactModel.id })
    const [contactInbox] = await db
      .insert(schema.contactInboxModel)
      .values({
        channel: "instagram",
        contactId: contact.id,
        inboxId: inbox.id,
        originalContactId: contact.id,
        source: "comments",
        sourceId: `contact-${suffix}`,
        createdAt: at("2026-01-01T00:00:00"),
        firstInteractionAt: at("2026-01-02T00:00:00"),
      })
      .returning({ id: schema.contactInboxModel.id })
    world = {
      contactId: contact.id,
      contactInboxId: contactInbox.id,
      inboxId: inbox.id,
      otherWorkspaceId: otherWorkspace.id,
      userId: user.id,
      workspaceId: workspace.id,
    }
  })

  afterEach(async () => {
    const db = drizzle({ client, relations, schema })
    for (const workspaceId of [world.workspaceId, world.otherWorkspaceId]) {
      await client.query(
        `DELETE FROM "ContactInboxPost" WHERE "workspaceId" = $1`,
        [workspaceId],
      )
      await client.query(
        `DELETE FROM "ContactActivity" WHERE "workspaceId" = $1`,
        [workspaceId],
      )
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
    }
    await db
      .delete(schema.userModel)
      .where(eq(schema.userModel.id, world.userId))
  })

  test("inboxSource: one row per contact inbox at firstInteractionAt, falling back to createdAt", async () => {
    const rows = await byKind("inboxSource")

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: "inboxSource",
      resourceKey: world.contactInboxId,
      channel: "instagram",
      inboxId: world.inboxId,
      details: { source: "comments" },
    })
    expect(rows[0].occurredAt).toEqual(at("2026-01-02T00:00:00"))

    await client.query(
      `UPDATE "ContactInbox" SET "firstInteractionAt" = NULL WHERE id = $1`,
      [world.contactInboxId],
    )
    expect((await byKind("inboxSource"))[0].occurredAt).toEqual(
      at("2026-01-01T00:00:00"),
    )
  })

  test("postComment: one row per post across inboxes at the earliest comment, removed posts hidden", async () => {
    const secondInbox = newId()
    await insert("Inbox", {
      id: secondInbox,
      name: "Second",
      channel: "instagram",
      sourceId: `second-${secondInbox}`,
      workspaceId: world.workspaceId,
    })
    const secondContactInbox = newId()
    await insert("ContactInbox", {
      id: secondContactInbox,
      originalContactId: world.contactId,
      contactId: world.contactId,
      inboxId: secondInbox,
      channel: "instagram",
      source: "comments",
      sourceId: `c-${secondContactInbox}`,
    })
    const livePost = newId()
    const removedPost = newId()
    for (const [postId, removedAt] of [
      [livePost, null],
      [removedPost, at("2026-02-01T00:00:00")],
    ] as const) {
      await insert("ChannelPost", {
        id: postId,
        workspaceId: world.workspaceId,
        inboxId: world.inboxId,
        channel: "instagram",
        integrationId: "1",
        sourceAccountId: "acc",
        externalPostId: `ext-${postId}`,
        caption: "Launch day",
        permalink: "https://example.test/p",
        removedAt,
      })
    }
    for (const [contactInboxId, postId, commentedAt] of [
      [world.contactInboxId, livePost, "2026-03-05T00:00:00"],
      [secondContactInbox, livePost, "2026-03-01T00:00:00"],
      [world.contactInboxId, removedPost, "2026-03-02T00:00:00"],
    ] as const) {
      await insert("ContactInboxPost", {
        workspaceId: world.workspaceId,
        contactInboxId,
        postId,
        commentedAt: at(commentedAt),
      })
    }

    const rows = await byKind("postComment")

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      resourceKey: livePost,
      resourceName: "Launch day",
      channel: "instagram",
      details: { permalink: "https://example.test/p", thumbnail: null },
    })
    expect(rows[0].occurredAt).toEqual(at("2026-03-01T00:00:00"))
  })

  test("minigame: latest play decides the time and prize; a membership row of another workspace's game is excluded", async () => {
    const game = await seedMinigame(world.workspaceId, "Wheel")
    const foreignGame = await seedMinigame(world.otherWorkspaceId, "Foreign")
    await insert("MinigameContact", {
      id: newId(),
      minigameId: game,
      contactId: world.contactId,
      openedAt: at("2026-04-01T00:00:00"),
      played: 2,
    })
    await insert("MinigameContact", {
      id: newId(),
      minigameId: foreignGame,
      contactId: world.contactId,
      openedAt: at("2026-04-09T00:00:00"),
    })
    await insert("MinigamePlay", {
      id: newId(),
      minigameId: foreignGame,
      contactId: world.contactId,
      isWinning: true,
      createdAt: at("2026-04-10T00:00:00"),
    })
    await insert("MinigamePlay", {
      id: newId(),
      minigameId: game,
      contactId: world.contactId,
      isWinning: false,
      createdAt: at("2026-04-02T00:00:00"),
    })
    await insert("MinigamePlay", {
      id: newId(),
      minigameId: game,
      contactId: world.contactId,
      isWinning: true,
      prizeName: "Coffee",
      createdAt: at("2026-04-03T00:00:00"),
    })

    const rows = await byKind("minigame")

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      resourceKey: game,
      resourceName: "Wheel",
      details: { played: 2, lastPrizeName: "Coffee", lastWon: true },
    })
    expect(rows[0].occurredAt).toEqual(at("2026-04-03T00:00:00"))
  })

  test("minigame without plays falls back to openedAt", async () => {
    const game = await seedMinigame(world.workspaceId, "Quiet")
    await insert("MinigameContact", {
      id: newId(),
      minigameId: game,
      contactId: world.contactId,
      openedAt: at("2026-04-01T00:00:00"),
    })

    const [row] = await byKind("minigame")

    expect(row.occurredAt).toEqual(at("2026-04-01T00:00:00"))
    expect(row.details).toMatchObject({ lastPrizeName: null, lastWon: null })
  })

  test("leaderboard: one row at lastActivityAt; a deleted board is hidden", async () => {
    const live = newId()
    const deleted = newId()
    for (const [leaderboardId, deletedAt] of [
      [live, null],
      [deleted, at("2026-05-02T00:00:00")],
    ] as const) {
      await insert("Leaderboard", {
        id: leaderboardId,
        workspaceId: world.workspaceId,
        name: `Board ${leaderboardId}`,
        startsAt: at("2026-05-01T00:00:00"),
        endsAt: at("2026-06-01T00:00:00"),
        platform: "gamification",
        scope: {},
        rules: {},
        tagIds: [],
        rewardSettings: {},
        deletedAt,
      })
      await insert("LeaderboardParticipant", {
        leaderboardId,
        contactId: world.contactId,
        workspaceId: world.workspaceId,
        score: 7,
        lastActivityAt: at("2026-05-05T00:00:00"),
        dailyCounts: {},
        breakdown: {},
      })
    }

    const rows = await byKind("leaderboard")

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ resourceKey: live, details: { score: 7 } })
    expect(rows[0].occurredAt).toEqual(at("2026-05-05T00:00:00"))
  })

  test("questionnaire: the completed submission wins over a newer in-progress one; cancelled and deleted are hidden", async () => {
    const questionnaireId = newId()
    const deletedId = newId()
    const cancelledOnlyId = newId()
    for (const [id, deletedAt] of [
      [questionnaireId, null],
      [deletedId, at("2026-06-01T00:00:00")],
      [cancelledOnlyId, null],
    ] as const) {
      await insert("Questionnaire", {
        id,
        name: `Q ${id}`,
        workspaceId: world.workspaceId,
        deletedAt,
      })
    }
    const submit = (
      qid: string,
      status: string,
      startedAt: string,
      completedAt: string | null,
      totalPoints: number | null,
    ) =>
      insert("QuestionnaireSubmission", {
        id: newId(),
        workspaceId: world.workspaceId,
        questionnaireId: qid,
        contactId: world.contactId,
        status,
        startedAt: at(startedAt),
        completedAt: completedAt ? at(completedAt) : null,
        totalPoints,
      })
    await submit(
      questionnaireId,
      "completed",
      "2026-06-02T00:00:00",
      "2026-06-02T01:00:00",
      9,
    )
    await submit(
      questionnaireId,
      "completed",
      "2026-06-03T00:00:00",
      "2026-06-03T01:00:00",
      11,
    )
    await submit(
      questionnaireId,
      "inProgress",
      "2026-06-10T00:00:00",
      null,
      null,
    )
    await submit(
      questionnaireId,
      "cancelled",
      "2026-06-11T00:00:00",
      null,
      null,
    )
    await submit(deletedId, "completed", "2026-06-02T00:00:00", null, 1)
    await submit(
      cancelledOnlyId,
      "cancelled",
      "2026-06-02T00:00:00",
      null,
      null,
    )

    const rows = await byKind("questionnaire")

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      resourceKey: questionnaireId,
      details: { status: "completed", submissions: 3 },
    })
    expect(rows[0].occurredAt).toEqual(at("2026-06-03T01:00:00"))
  })

  test("questionnaire: an in-progress submission alone shows at startedAt", async () => {
    const questionnaireId = newId()
    await insert("Questionnaire", {
      id: questionnaireId,
      name: "Q",
      workspaceId: world.workspaceId,
    })
    await insert("QuestionnaireSubmission", {
      id: newId(),
      workspaceId: world.workspaceId,
      questionnaireId,
      contactId: world.contactId,
      status: "inProgress",
      startedAt: at("2026-06-10T00:00:00"),
    })

    const [row] = await byKind("questionnaire")

    expect(row.details).toMatchObject({ status: "inProgress", submissions: 1 })
    expect(row.occurredAt).toEqual(at("2026-06-10T00:00:00"))
  })

  test("questionnaire: timed-out and failed attempts are no opt-in and are not counted", async () => {
    const onlyTimeout = newId()
    const mixed = newId()
    for (const id of [onlyTimeout, mixed]) {
      await insert("Questionnaire", {
        id,
        name: `Q ${id}`,
        workspaceId: world.workspaceId,
      })
    }
    for (const [questionnaireId, status] of [
      [onlyTimeout, "timeout"],
      [mixed, "failed"],
      [mixed, "timeout"],
      [mixed, "inProgress"],
    ] as const) {
      await insert("QuestionnaireSubmission", {
        id: newId(),
        workspaceId: world.workspaceId,
        questionnaireId,
        contactId: world.contactId,
        status,
        startedAt: at("2026-06-10T00:00:00"),
      })
    }

    const rows = await byKind("questionnaire")

    expect(rows.map((row) => row.resourceKey)).toEqual([mixed])
    expect(rows[0].details).toMatchObject({
      status: "inProgress",
      submissions: 1,
    })
  })

  test("questionnaire: a completed attempt without completedAt still has a time (its last update)", async () => {
    const questionnaireId = newId()
    await insert("Questionnaire", {
      id: questionnaireId,
      name: "Q",
      workspaceId: world.workspaceId,
    })
    await insert("QuestionnaireSubmission", {
      id: newId(),
      workspaceId: world.workspaceId,
      questionnaireId,
      contactId: world.contactId,
      status: "completed",
      startedAt: at("2026-06-10T00:00:00"),
      completedAt: null,
      updatedAt: at("2026-06-11T00:00:00"),
    })

    const [row] = await list({ kinds: ["questionnaire"] })

    expect(row.details).toMatchObject({ status: "completed" })
    expect(row.occurredAt).toEqual(at("2026-06-11T00:00:00"))
    expect(Number.isNaN(row.occurredAt.getTime())).toBe(false)
  })

  test("miniApp, poll, leadForm, inboundWebhook, commentAutomation, refLink, magicLink, form follow their rules", async () => {
    const miniApp = newId()
    await insert("MiniApp", {
      id: miniApp,
      workspaceId: world.workspaceId,
      name: "App",
      definition: {},
      flowJson: {},
    })
    for (const day of ["02", "05"]) {
      await insert("MiniAppSubmission", {
        id: newId(),
        workspaceId: world.workspaceId,
        miniAppId: miniApp,
        contactId: world.contactId,
        source: "web",
        answers: {},
        createdAt: at(`2026-07-${day}T00:00:00`),
      })
    }

    const poll = newId()
    const candidate = newId()
    await insert("Poll", {
      id: poll,
      workspaceId: world.workspaceId,
      name: "Poll",
      imageUrl: "x",
      startsAt: at("2026-07-01T00:00:00"),
      endsAt: at("2026-08-01T00:00:00"),
    })
    await insert("PollCandidate", {
      id: candidate,
      workspaceId: world.workspaceId,
      pollId: poll,
      position: 0,
      name: "Alice",
    })
    await insert("PollVote", {
      id: newId(),
      workspaceId: world.workspaceId,
      pollId: poll,
      candidateId: candidate,
      contactId: world.contactId,
      updatedAt: at("2026-07-06T00:00:00"),
    })

    const automation = newId()
    await insert("FacebookLeadAdsAutomation", {
      id: automation,
      name: "Leads",
      workspaceId: world.workspaceId,
      pageId: "p",
      formId: "f",
      formName: "Form X",
    })
    for (const [leadgenId, day] of [
      ["l1", "01"],
      ["l2", "07"],
    ] as const) {
      await insert("FacebookLeadAdsLead", {
        id: newId(),
        automationId: automation,
        leadgenId,
        contactId: world.contactId,
        createdAt: at(`2026-07-${day}T00:00:00`),
      })
    }

    const webhook = newId()
    await insert("InboundWebhook", {
      id: webhook,
      workspaceId: world.workspaceId,
      name: "Hook",
      token: `t-${webhook}`,
      identifiers: [],
      fieldMappings: [],
      actions: [],
    })
    for (const [status, day] of [
      ["processed", "03"],
      ["processed", "04"],
      ["completedWithErrors", "05"],
      ["skipped", "20"],
      ["failed", "21"],
    ] as const) {
      await insert("InboundWebhookRequest", {
        id: newId(),
        workspaceId: world.workspaceId,
        inboundWebhookId: webhook,
        contactId: world.contactId,
        status,
        payload: {},
        createdAt: at(`2026-07-${day}T00:00:00`),
      })
    }

    const comment = newId()
    await insert("CommentAutomation", {
      id: comment,
      name: "Comments",
      workspaceId: world.workspaceId,
      type: "tiktok",
      inboxId: world.inboxId,
    })
    await insert("CommentAutomationEvent", {
      id: newId(),
      workspaceId: world.workspaceId,
      automationId: comment,
      contactId: world.contactId,
      postId: "p",
      commentId: "c",
      replyChannel: "private",
      replyType: "text",
      status: "sent",
      occurredAt: at("2026-07-08T00:00:00"),
    })

    const flowId = newId()
    await insert("Flow", {
      id: flowId,
      name: "F",
      workspaceId: world.workspaceId,
    })
    const refLink = newId()
    await insert("Reflink", {
      id: refLink,
      name: "QR",
      type: "qrCode",
      flowId,
      workspaceId: world.workspaceId,
    })
    for (const day of ["02", "09"]) {
      await insert("RefLinkStat", {
        workspaceId: world.workspaceId,
        linkId: refLink,
        contactId: world.contactId,
        contactInboxId: world.contactInboxId,
        occurredAt: at(`2026-07-${day}T00:00:00`),
      })
    }

    const magicLink = await seedMagicLink("Magic")
    await seedMagicStat(magicLink, at("2026-07-10T00:00:00"))

    const integrationId = newId()
    await insert("IntegrationWhatsapp", {
      id: integrationId,
      auth: {},
      phoneNumberId: "1",
      wabaId: "w",
      businessId: "b",
      name: "WA",
      workspaceId: world.workspaceId,
      inboxId: world.inboxId,
    })
    const whatsappFlow = newId()
    await insert("WhatsappFlow", {
      id: whatsappFlow,
      name: "Survey",
      integrationWhatsappId: integrationId,
      sourceId: "s",
      status: "PUBLISHED",
    })
    await insert("ContactActivity", {
      workspaceId: world.workspaceId,
      contactId: world.contactId,
      activityType: "formCompleted",
      referenceType: "whatsappFlow",
      parentReferenceId: "0",
      referenceId: whatsappFlow,
      firstOccurredAt: at("2026-07-11T00:00:00"),
    })

    const rows = await list({
      kinds: [
        "miniApp",
        "poll",
        "leadForm",
        "inboundWebhook",
        "commentAutomation",
        "refLink",
        "magicLink",
        "form",
      ],
    })
    const row = (kind: ContactTouchpointKind) =>
      rows.find((candidate) => candidate.kind === kind)

    expect(row("miniApp")).toMatchObject({
      resourceKey: miniApp,
      details: { submissions: 2 },
    })
    expect(row("miniApp")?.occurredAt).toEqual(at("2026-07-05T00:00:00"))
    expect(row("poll")).toMatchObject({
      resourceKey: poll,
      details: { candidateName: "Alice" },
    })
    expect(row("poll")?.occurredAt).toEqual(at("2026-07-06T00:00:00"))
    expect(row("leadForm")).toMatchObject({
      resourceKey: automation,
      details: { formName: "Form X", leads: 2 },
    })
    expect(row("leadForm")?.occurredAt).toEqual(at("2026-07-07T00:00:00"))
    expect(row("inboundWebhook")).toMatchObject({
      resourceKey: webhook,
      details: { requests: 3 },
    })
    expect(row("inboundWebhook")?.occurredAt).toEqual(at("2026-07-05T00:00:00"))
    expect(row("commentAutomation")).toMatchObject({
      resourceKey: comment,
      inboxId: world.inboxId,
      details: { automationType: "tiktok", replies: 1 },
    })
    expect(row("refLink")).toMatchObject({
      resourceKey: refLink,
      details: { linkType: "qrCode", visits: 2 },
    })
    expect(row("refLink")?.occurredAt).toEqual(at("2026-07-09T00:00:00"))
    expect(row("magicLink")).toMatchObject({
      resourceKey: magicLink,
      details: { clicks: 1 },
    })
    expect(row("form")).toMatchObject({
      resourceKey: whatsappFlow,
      resourceName: "Survey",
      channel: "whatsapp",
    })
    expect(row("form")?.occurredAt).toEqual(at("2026-07-11T00:00:00"))
  })

  test("events of another contact or another workspace's link are not counted", async () => {
    const link = await seedMagicLink("Mine")
    await seedMagicStat(link, at("2026-08-01T00:00:00"))
    await client.query(
      `INSERT INTO "MagicLinkStat" ("workspaceId","linkId","contactId","contactInboxId","occurredAt") VALUES ($1,$2,$3,$4,$5)`,
      [
        world.workspaceId,
        link,
        newId(),
        world.contactInboxId,
        at("2026-08-02T00:00:00"),
      ],
    )

    const [row] = await byKind("magicLink")

    expect(row.details).toEqual({ clicks: 1 })
  })

  test("kinds filter runs only the listed kinds", async () => {
    const link = await seedMagicLink("Only")
    await seedMagicStat(link, at("2026-08-01T00:00:00"))

    const magicOnly = await list({ kinds: ["magicLink"] })
    const everything = await list()

    expect(magicOnly.map((row) => row.kind)).toEqual(["magicLink"])
    expect(everything.map((row) => row.kind).sort()).toEqual([
      "inboxSource",
      "magicLink",
    ])
  })

  test("a busy resource with over 1,000 events and an older resource both appear with exact counts", async () => {
    const busy = await seedMagicLink("Busy")
    const older = await seedMagicLink("Older")
    await seedMagicStat(older, at("2026-01-05T00:00:00"))
    await client.query(
      `INSERT INTO "MagicLinkStat" ("workspaceId","linkId","contactId","contactInboxId","occurredAt")
       SELECT $1, $2, $3, g, TIMESTAMPTZ '2026-09-01T00:00:00Z' + g * INTERVAL '1 second'
       FROM generate_series(1, 1200) g`,
      [world.workspaceId, busy, world.contactId],
    )

    const rows = await list({ kinds: ["magicLink"], limit: 10 })

    expect(rows.map((row) => [row.resourceKey, row.details.clicks])).toEqual([
      [busy, 1200],
      [older, 1],
    ])
  })

  test("equal timestamps across kinds page in (occurredAt, kind, resourceKey) order with no gaps or repeats", async () => {
    const sameInstant = at("2026-10-01T00:00:00")
    const links = [await seedMagicLink("m1"), await seedMagicLink("m2")]
    for (const link of links) {
      await seedMagicStat(link, sameInstant)
    }
    const flowId = newId()
    await insert("Flow", {
      id: flowId,
      name: "F",
      workspaceId: world.workspaceId,
    })
    const refLink = newId()
    await insert("Reflink", {
      id: refLink,
      name: "R",
      flowId,
      workspaceId: world.workspaceId,
    })
    await insert("RefLinkStat", {
      workspaceId: world.workspaceId,
      linkId: refLink,
      contactId: world.contactId,
      contactInboxId: world.contactInboxId,
      occurredAt: sameInstant,
    })

    const all = await list({ limit: 100 })
    const walked: string[] = []
    let cursor: Parameters<
      typeof contactTouchpointRepository.listByContact
    >[0]["cursor"]
    for (;;) {
      const page = await list({ limit: 2, cursor })
      walked.push(...page.map((row) => `${row.kind}:${row.resourceKey}`))
      const last = page.at(-1)
      if (page.length < 2 || !last) {
        break
      }
      cursor = {
        occurredAt: last.occurredAtKey,
        kind: last.kind,
        resourceKey: last.resourceKey,
      }
    }

    const expected = [
      ...links
        .map((link) => `magicLink:${link}`)
        .sort()
        .reverse(),
      `refLink:${refLink}`,
    ]
    expect(walked.slice(0, 3)).toEqual([
      // kind DESC: refLink sorts after magicLink, so it comes first.
      expected[2],
      ...expected.slice(0, 2),
    ])
    expect(walked).toEqual(all.map((row) => `${row.kind}:${row.resourceKey}`))
    expect(new Set(walked).size).toBe(walked.length)
  })

  test("events a microsecond apart are not skipped or repeated by the cursor", async () => {
    const link = await seedMagicLink("Micro")
    const other = await seedMagicLink("Micro2")
    await seedMagicStat(link, "2026-11-01T00:00:00.123456Z")
    await seedMagicStat(other, "2026-11-01T00:00:00.123457Z")

    const first = await list({ kinds: ["magicLink"], limit: 1 })
    const second = await list({
      kinds: ["magicLink"],
      limit: 1,
      cursor: {
        occurredAt: first[0].occurredAtKey,
        kind: first[0].kind,
        resourceKey: first[0].resourceKey,
      },
    })

    expect(first[0].resourceKey).toBe(other)
    expect(first[0].occurredAtKey).toBe("2026-11-01T00:00:00.123457Z")
    expect(second.map((row) => row.resourceKey)).toEqual([link])
  })

  test("live view: a newer event on an older link moves it to the first page on refetch", async () => {
    const older = await seedMagicLink("A")
    const newer = await seedMagicLink("B")
    await seedMagicStat(older, at("2026-01-10T00:00:00"))
    await seedMagicStat(newer, at("2026-01-20T00:00:00"))
    const before = await list({ kinds: ["magicLink"], limit: 1 })
    await seedMagicStat(older, at("2026-01-30T00:00:00"))
    const after = await list({ kinds: ["magicLink"], limit: 1 })

    expect(before[0].resourceKey).toBe(newer)
    expect(after[0].resourceKey).toBe(older)
  })

  test("a contact of another workspace has no rows in this workspace's feed", async () => {
    const link = await seedMagicLink("Mine")
    await seedMagicStat(link, at("2026-08-01T00:00:00"))

    const rows = await contactTouchpointRepository.listByContact({
      workspaceId: world.otherWorkspaceId,
      contactId: world.contactId,
      limit: 10,
    })

    expect(rows).toEqual([])
  })

  describe("MagicLinkStat contact index migration", () => {
    const migrationName = "20261127204755_magic_link_stat_contact_index"
    const indexName = "MagicLinkStat_workspaceId_contactId_occurredAt_idx"
    const statements = readFileSync(
      join(
        import.meta.dirname,
        "../../drizzle",
        migrationName,
        "migration.sql",
      ),
      "utf8",
    )
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean)

    const indexState = async () => {
      const { rows } = await client.query<{
        isvalid: boolean
        isunique: boolean
      }>(
        `SELECT i.indisvalid AS isvalid, i.indisunique AS isunique
         FROM pg_index i WHERE i.indexrelid = to_regclass($1)`,
        [`"${indexName}"`],
      )
      return rows[0]
    }

    test("a rerun replaces an invalid leftover index with a valid one", async () => {
      const link = await seedMagicLink("Dup")
      const twin = await seedMagicLink("Dup2")
      await seedMagicStat(link, at("2026-12-01T00:00:00"))
      await seedMagicStat(twin, at("2026-12-01T00:00:00"))
      await client.query(`DROP INDEX IF EXISTS "${indexName}"`)
      // A unique build over duplicate keys fails and leaves an INVALID index.
      await expect(
        client.query(
          `CREATE UNIQUE INDEX CONCURRENTLY "${indexName}" ON "MagicLinkStat" ("workspaceId","contactId","occurredAt")`,
        ),
      ).rejects.toThrow()
      expect((await indexState())?.isvalid).toBe(false)

      for (const statement of statements) {
        await client.query(statement)
      }

      expect(await indexState()).toEqual({ isvalid: true, isunique: false })

      // Running it again is a no-op.
      for (const statement of statements) {
        await client.query(statement)
      }
      expect(await indexState()).toEqual({ isvalid: true, isunique: false })
    })
  })
})
