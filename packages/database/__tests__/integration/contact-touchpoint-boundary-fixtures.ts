// @vitest-environment node

/**
 * Shared world and seeders for the contact touchpoint boundary matrix
 * (`contact-touchpoint-boundary-*.test.ts`): a real Postgres, one workspace
 * with a contact, plus a foreign workspace, created per test and removed after.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest"
import type { ContactTouchpointKind } from "../../src/partials/contact-touchpoint"
import { relations } from "../../src/relations"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

export const databaseUrl = realDatabaseUrl()

let sequence = 0
/** Unique bigint ids: the tables generate theirs in application code. */
export const newId = (): string =>
  String(BigInt(Date.now()) * 1_000_000n + BigInt(++sequence))

export const at = (isoSeconds: string): Date => new Date(`${isoSeconds}Z`)

export type Ev = {
  /** Workspace the event row itself carries (when the table has one). */
  rowWs: string
  contactId: string
  /** The contact's ContactInbox in `rowWs`. */
  ci: string
  when: Date
  /** Explicit resource key for kinds keyed by the membership row itself. */
  key?: string
  n: number
}

export type Seeder = {
  /** Creates the parent resource in workspace `parentWs`; returns its id. */
  make: (parentWs: string, inboxId: string, id: string) => Promise<string>
  /** Adds one event of one contact; returns the expected `resourceKey`. */
  add: (parent: string, ev: Ev) => Promise<string>
  /** Details field that counts events, when the kind has one. */
  countField?: string
  /** Several events of one contact on one parent are possible. */
  repeatable?: boolean
}

export type TouchpointRepository =
  typeof import("../../src/repositories/contact-touchpoint/repository")["contactTouchpointRepository"]

/**
 * Registers the per-test world (hooks included) and returns what the tests
 * use. Call it inside the `describe` so the hooks belong to that suite.
 */
export const installBoundaryWorld = (
  contactTouchpointRepository: TouchpointRepository,
) => {
  let client: Client
  let world: {
    contactId: string
    contactInboxId: string
    inboxId: string
    otherWorkspaceId: string
    userId: string
    workspaceId: string
  }

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
      limit: 200,
      ...overrides,
    })
  const byKind = (kind: ContactTouchpointKind) => list({ kinds: [kind] })

  const makeInbox = async (workspaceId: string) => {
    const id = newId()
    await insert("Inbox", {
      id,
      name: `Inbox ${id}`,
      channel: "instagram",
      sourceId: `src-${id}`,
      workspaceId,
    })
    return id
  }

  const makeContactInbox = async (contactId: string, inboxId: string) => {
    const id = newId()
    await insert("ContactInbox", {
      id,
      originalContactId: contactId,
      contactId,
      inboxId,
      channel: "instagram",
      source: "direct",
      sourceId: `ci-${id}`,
      firstInteractionAt: at("2026-01-02T00:00:00"),
    })
    return id
  }

  const makeContact = async (workspaceId: string) => {
    const db = drizzle({ client, relations, schema })
    const [contact] = await db
      .insert(schema.contactModel)
      .values({ workspaceId })
      .returning({ id: schema.contactModel.id })
    return contact.id
  }

  const seeders: Record<ContactTouchpointKind, Seeder> = {
    inboxSource: {
      make: (ws) => makeInbox(ws),
      add: async (inboxId, ev) => {
        const id = ev.key ?? newId()
        await insert("ContactInbox", {
          id,
          originalContactId: ev.contactId,
          contactId: ev.contactId,
          inboxId,
          channel: "instagram",
          source: "direct",
          sourceId: `ci-${id}`,
          firstInteractionAt: ev.when,
        })
        return id
      },
    },
    postComment: {
      make: async (ws, inboxId, id) => {
        await insert("ChannelPost", {
          id,
          workspaceId: ws,
          inboxId,
          channel: "instagram",
          integrationId: "1",
          sourceAccountId: "acc",
          externalPostId: `ext-${id}`,
          caption: "Post",
        })
        return id
      },
      add: async (postId, ev) => {
        await insert("ContactInboxPost", {
          workspaceId: ev.rowWs,
          contactInboxId: ev.ci,
          postId,
          commentedAt: ev.when,
        })
        return postId
      },
    },
    minigame: {
      make: async (ws, _inbox, id) => {
        await insert("Minigame", {
          id,
          workspaceId: ws,
          name: `Game ${id}`,
          type: "luckyWheel",
          generalSettings: {},
          appearance: {},
          playerSettings: {},
          prizeSettings: {},
          winningMessageSettings: {},
          nonWinningMessageSettings: {},
        })
        return id
      },
      add: async (gameId, ev) => {
        await insert("MinigameContact", {
          id: newId(),
          minigameId: gameId,
          contactId: ev.contactId,
          openedAt: new Date(ev.when.getTime() - 86_400_000),
          played: 1,
        })
        await insert("MinigamePlay", {
          id: newId(),
          minigameId: gameId,
          contactId: ev.contactId,
          isWinning: false,
          createdAt: ev.when,
        })
        return gameId
      },
    },
    leaderboard: {
      make: async (ws, _inbox, id) => {
        await insert("Leaderboard", {
          id,
          workspaceId: ws,
          name: `Board ${id}`,
          startsAt: at("2026-05-01T00:00:00"),
          endsAt: at("2026-06-01T00:00:00"),
          platform: "gamification",
          scope: {},
          rules: {},
          tagIds: [],
          rewardSettings: {},
        })
        return id
      },
      add: async (boardId, ev) => {
        await insert("LeaderboardParticipant", {
          leaderboardId: boardId,
          contactId: ev.contactId,
          workspaceId: ev.rowWs,
          score: 3,
          lastActivityAt: ev.when,
          dailyCounts: {},
          breakdown: {},
        })
        return boardId
      },
    },
    questionnaire: {
      make: async (ws, _inbox, id) => {
        await insert("Questionnaire", {
          id,
          name: `Q ${id}`,
          workspaceId: ws,
        })
        return id
      },
      add: async (qid, ev) => {
        await insert("QuestionnaireSubmission", {
          id: newId(),
          workspaceId: ev.rowWs,
          questionnaireId: qid,
          contactId: ev.contactId,
          status: "completed",
          startedAt: new Date(ev.when.getTime() - 3_600_000),
          completedAt: ev.when,
        })
        return qid
      },
      countField: "submissions",
      repeatable: true,
    },
    miniApp: {
      make: async (ws, _inbox, id) => {
        await insert("MiniApp", {
          id,
          workspaceId: ws,
          name: `App ${id}`,
          definition: {},
          flowJson: {},
        })
        return id
      },
      add: async (appId, ev) => {
        await insert("MiniAppSubmission", {
          id: newId(),
          workspaceId: ev.rowWs,
          miniAppId: appId,
          contactId: ev.contactId,
          source: "web",
          answers: {},
          createdAt: ev.when,
        })
        return appId
      },
      countField: "submissions",
      repeatable: true,
    },
    poll: {
      make: async (ws, _inbox, id) => {
        await insert("Poll", {
          id,
          workspaceId: ws,
          name: `Poll ${id}`,
          imageUrl: "x",
          startsAt: at("2026-07-01T00:00:00"),
          endsAt: at("2026-08-01T00:00:00"),
        })
        await insert("PollCandidate", {
          id: `${id}1`.length > 19 ? newId() : `${id}1`,
          workspaceId: ws,
          pollId: id,
          position: 0,
          name: "Alice",
        })
        return id
      },
      add: async (pollId, ev) => {
        const { rows } = await client.query<{ id: string }>(
          `SELECT id FROM "PollCandidate" WHERE "pollId" = $1`,
          [pollId],
        )
        await insert("PollVote", {
          id: newId(),
          workspaceId: ev.rowWs,
          pollId,
          candidateId: rows[0].id,
          contactId: ev.contactId,
          updatedAt: ev.when,
        })
        return pollId
      },
    },
    leadForm: {
      make: async (ws, _inbox, id) => {
        await insert("FacebookLeadAdsAutomation", {
          id,
          name: `Leads ${id}`,
          workspaceId: ws,
          pageId: "p",
          formId: `f-${id}`,
          formName: "Form",
        })
        return id
      },
      add: async (automationId, ev) => {
        await insert("FacebookLeadAdsLead", {
          id: newId(),
          automationId,
          leadgenId: `lead-${newId()}`,
          contactId: ev.contactId,
          createdAt: ev.when,
        })
        return automationId
      },
      countField: "leads",
      repeatable: true,
    },
    inboundWebhook: {
      make: async (ws, _inbox, id) => {
        await insert("InboundWebhook", {
          id,
          workspaceId: ws,
          name: `Hook ${id}`,
          token: `t-${id}`,
          identifiers: [],
          fieldMappings: [],
          actions: [],
        })
        return id
      },
      add: async (hookId, ev) => {
        await insert("InboundWebhookRequest", {
          id: newId(),
          workspaceId: ev.rowWs,
          inboundWebhookId: hookId,
          contactId: ev.contactId,
          status: "processed",
          payload: {},
          createdAt: ev.when,
        })
        return hookId
      },
      countField: "requests",
      repeatable: true,
    },
    commentAutomation: {
      make: async (ws, inboxId, id) => {
        await insert("CommentAutomation", {
          id,
          name: `Comments ${id}`,
          workspaceId: ws,
          type: "tiktok",
          inboxId,
        })
        return id
      },
      add: async (automationId, ev) => {
        await insert("CommentAutomationEvent", {
          id: newId(),
          workspaceId: ev.rowWs,
          automationId,
          contactId: ev.contactId,
          postId: "p",
          commentId: `c-${newId()}`,
          replyChannel: "private",
          replyType: "text",
          status: "sent",
          occurredAt: ev.when,
        })
        return automationId
      },
      countField: "replies",
      repeatable: true,
    },
    refLink: {
      make: async (ws, _inbox, id) => {
        const flowId = newId()
        await insert("Flow", { id: flowId, name: "F", workspaceId: ws })
        await insert("Reflink", {
          id,
          name: `Ref ${id}`,
          flowId,
          workspaceId: ws,
        })
        return id
      },
      add: async (linkId, ev) => {
        await insert("RefLinkStat", {
          workspaceId: ev.rowWs,
          linkId,
          contactId: ev.contactId,
          contactInboxId: ev.ci,
          occurredAt: ev.when,
        })
        return linkId
      },
      countField: "visits",
      repeatable: true,
    },
    magicLink: {
      make: async (ws, _inbox, id) => {
        await insert("MagicLink", {
          id,
          workspaceId: ws,
          name: `Magic ${id}`,
          url: "https://example.test",
        })
        return id
      },
      add: async (linkId, ev) => {
        await insert("MagicLinkStat", {
          workspaceId: ev.rowWs,
          linkId,
          contactId: ev.contactId,
          contactInboxId: ev.ci,
          occurredAt: ev.when,
        })
        return linkId
      },
      countField: "clicks",
      repeatable: true,
    },
    form: {
      make: async (ws, _inboxId, id) => {
        // IntegrationWhatsapp.inboxId is unique: every flow gets its own inbox.
        const inboxId = await makeInbox(ws)
        const integrationId = newId()
        await insert("IntegrationWhatsapp", {
          id: integrationId,
          auth: {},
          phoneNumberId: `pn-${integrationId}`,
          wabaId: "w",
          businessId: "b",
          name: "WA",
          workspaceId: ws,
          inboxId,
        })
        await insert("WhatsappFlow", {
          id,
          name: `Flow ${id}`,
          integrationWhatsappId: integrationId,
          sourceId: `s-${id}`,
          status: "PUBLISHED",
        })
        return id
      },
      add: async (flowId, ev) => {
        await insert("ContactActivity", {
          workspaceId: ev.rowWs,
          contactId: ev.contactId,
          activityType: "formCompleted",
          referenceType: "whatsappFlow",
          parentReferenceId: "0",
          referenceId: flowId,
          firstOccurredAt: ev.when,
        })
        return flowId
      },
    },
  }

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
      .values({ email: `touchpoint-bnd-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace, otherWorkspace] = await db
      .insert(schema.workspaceModel)
      .values([
        { name: `touchpoint-bnd-a-${suffix}`, ownerId: user.id },
        { name: `touchpoint-bnd-b-${suffix}`, ownerId: user.id },
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
        source: "direct",
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

  const keys = (rows: { resourceKey: string }[]) =>
    rows.map((row) => row.resourceKey)

  return {
    get client() {
      return client
    },
    get world() {
      return world
    },
    insert,
    list,
    byKind,
    makeInbox,
    makeContactInbox,
    makeContact,
    seeders,
    keys,
  }
}
