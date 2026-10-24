// @vitest-environment node

/**
 * Real-SQL semantics of the activity-backed contact filters (Executed Flow /
 * Step, Keywords Received, Sent message, Last Delivered, Email phases): set
 * operators are exact complements, a contact with no history matches the
 * negatives, nodes are scoped by their flow, workspaces never leak into each
 * other. Runs only against an explicitly configured, migrated local database.
 */

import { normalizeForMatch } from "@chatbotx.io/utils/normalize-for-match"
import { and, eq, relationsFilterToSQL } from "drizzle-orm"
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
import { applyContactFilter } from "../../src/queries/contact-filter"
import { relations } from "../../src/relations"
import { contactRepository } from "../../src/repositories/contact/repository"
import {
  type ContactActivityRecord,
  contactActivityRepository,
} from "../../src/repositories/contact-activity/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const FLOW_1 = "1001"
const FLOW_2 = "1002"
const NODE_A = "2001"
const TOPIC_1 = "3001"
const KEYWORD_1 = "4001"
const KEYWORD_2 = "4002"
const T = (iso: string) => new Date(iso)

type Fixture = {
  contacts: string[]
  foreignContact: string
  userIds: string[]
  workspaceId: string
  foreignWorkspaceId: string
}

describe.skipIf(!databaseUrl)("contact activity filters (real SQL)", () => {
  let client: Client
  let fixture: Fixture

  const database = () => drizzle({ client, relations, schema })

  const activity = (
    contactId: string,
    overrides: Partial<ContactActivityRecord>,
  ): ContactActivityRecord => ({
    activityType: "flowExecuted",
    contactId,
    occurredAt: T("2026-01-01T00:00:00Z"),
    parentReferenceId: "0",
    referenceId: FLOW_1,
    referenceType: "flow",
    ...overrides,
  })

  const matching = async (
    conditions: Record<string, unknown>[],
    operator: "and" | "or" = "and",
  ): Promise<string[]> => {
    const where = relationsFilterToSQL(
      schema.contactModel,
      applyContactFilter(
        { conditions, operator },
        fixture.workspaceId,
      ) as never,
    )
    if (!where) {
      throw new Error("Expected the filter to render a predicate")
    }
    const rows = await database()
      .select({ id: schema.contactModel.id })
      .from(schema.contactModel)
      .where(
        and(eq(schema.contactModel.workspaceId, fixture.workspaceId), where),
      )
    return rows.map((row) => row.id).sort()
  }

  const ids = (...indexes: number[]) =>
    indexes.map((index) => fixture.contacts[index]).sort()

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  beforeEach(async () => {
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const make = async (label: string, contactCount: number) => {
      const [user] = await db
        .insert(schema.userModel)
        .values({ email: `activity-filter-${label}-${suffix}@example.test` })
        .returning({ id: schema.userModel.id })
      const [workspace] = await db
        .insert(schema.workspaceModel)
        .values({
          name: `activity-filter-${label}-${suffix}`,
          ownerId: user.id,
        })
        .returning({ id: schema.workspaceModel.id })
      const created = await db
        .insert(schema.contactModel)
        .values(
          Array.from({ length: contactCount }, () => ({
            workspaceId: workspace.id,
          })),
        )
        .returning({ id: schema.contactModel.id })
      return {
        contacts: created.map((c) => c.id),
        userId: user.id,
        workspaceId: workspace.id,
      }
    }
    const own = await make("own", 5)
    const foreign = await make("foreign", 1)
    fixture = {
      contacts: own.contacts,
      foreignContact: foreign.contacts[0] as string,
      foreignWorkspaceId: foreign.workspaceId,
      userIds: [own.userId, foreign.userId],
      workspaceId: own.workspaceId,
    }

    const [c0, c1, c2, c3] = fixture.contacts as [
      string,
      string,
      string,
      string,
    ]
    await contactActivityRepository.upsertActivities(
      {
        records: [
          activity(c0, { referenceId: FLOW_1 }),
          activity(c1, { referenceId: FLOW_1 }),
          activity(c2, { referenceId: FLOW_2 }),
          activity(c0, {
            activityType: "flowNodeExecuted",
            parentReferenceId: FLOW_1,
            referenceId: NODE_A,
            referenceType: "flowNode",
          }),
          activity(c1, {
            activityType: "flowNodeExecuted",
            parentReferenceId: FLOW_2,
            referenceId: NODE_A,
            referenceType: "flowNode",
          }),
          activity(c0, {
            activityType: "automatedResponseMatched",
            referenceId: KEYWORD_1,
            referenceType: "automatedResponse",
          }),
          activity(c1, {
            activityType: "automatedResponseMatched",
            referenceId: KEYWORD_2,
            referenceType: "automatedResponse",
          }),
          activity(c3, {
            activityType: "messageSent",
            referenceId: "-1",
            referenceType: "emailTopic",
          }),
          activity(c2, {
            activityType: "messageSent",
            referenceId: TOPIC_1,
            referenceType: "emailTopic",
          }),
        ],
        workspaceId: fixture.workspaceId,
      },
      db,
    )
    // The same flow id in another workspace must never match this workspace.
    await contactActivityRepository.upsertActivities(
      {
        records: [activity(fixture.foreignContact, { referenceId: FLOW_1 })],
        workspaceId: fixture.foreignWorkspaceId,
      },
      db,
    )
    for (const [contactId, text] of [
      [c0, "Xin chào các bạn"],
      [c1, "Tôi muốn mua HÀNG"],
    ] as const) {
      await contactActivityRepository.insertKeywordMessage(
        {
          record: {
            automatedResponseId: KEYWORD_1,
            contactId,
            messageId: `${contactId}9`,
            normalizedText: normalizeForMatch(text),
            occurredAt: T("2026-01-01T00:00:00Z"),
            text,
          },
          workspaceId: fixture.workspaceId,
        },
        db,
      )
    }
    await contactActivityRepository.upsertLastDelivered(
      {
        records: [
          { contactId: c0, deliveredAt: T("2026-05-19T10:00:00Z") },
          { contactId: c1, deliveredAt: T("2026-05-20T10:00:00Z") },
        ],
        workspaceId: fixture.workspaceId,
      },
      db,
    )
  })

  afterEach(async () => {
    const db = database()
    for (const workspaceId of [
      fixture.workspaceId,
      fixture.foreignWorkspaceId,
    ]) {
      for (const table of [
        "ContactActivity",
        "ContactKeywordMessage",
        "ContactState",
      ]) {
        await client.query(`DELETE FROM "${table}" WHERE "workspaceId" = $1`, [
          workspaceId,
        ])
      }
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, workspaceId))
    }
    for (const userId of fixture.userIds) {
      await db.delete(schema.userModel).where(eq(schema.userModel.id, userId))
    }
  })

  test("Is matches any listed flow (OR) and never another workspace's activity", async () => {
    expect(
      await matching([
        { field: "executedFlow", operator: "in", value: [FLOW_1] },
      ]),
    ).toEqual(ids(0, 1))
    expect(
      await matching([
        { field: "executedFlow", operator: "in", value: [FLOW_1, FLOW_2] },
      ]),
    ).toEqual(ids(0, 1, 2))
  })

  test("Is Not is the exact complement and includes contacts with no history", async () => {
    const positive = await matching([
      { field: "executedFlow", operator: "in", value: [FLOW_1] },
    ])
    const negative = await matching([
      { field: "executedFlow", operator: "notIn", value: [FLOW_1] },
    ])
    expect(negative).toEqual(ids(2, 3, 4))
    expect([...positive, ...negative].sort()).toEqual(ids(0, 1, 2, 3, 4))
  })

  test("Has no value / has a value test for any activity of the type", async () => {
    expect(
      await matching([{ field: "executedFlow", operator: "isEmpty" }]),
    ).toEqual(ids(3, 4))
    expect(
      await matching([{ field: "executedFlow", operator: "isNotEmpty" }]),
    ).toEqual(ids(0, 1, 2))
  })

  test("a step is scoped by its flow: the same node id in another flow is a different step", async () => {
    expect(
      await matching([
        {
          field: "executedStep",
          operator: "in",
          value: [`${FLOW_1}:${NODE_A}`],
        },
      ]),
    ).toEqual(ids(0))
    expect(
      await matching([
        {
          field: "executedStep",
          operator: "in",
          value: [`${FLOW_2}:${NODE_A}`],
        },
      ]),
    ).toEqual(ids(1))
    expect(
      await matching([
        {
          field: "executedStep",
          operator: "notIn",
          value: [`${FLOW_1}:${NODE_A}`],
        },
      ]),
    ).toEqual(ids(1, 2, 3, 4))
  })

  test("keywords received follow the same set semantics", async () => {
    expect(
      await matching([
        {
          field: "keywordsReceived",
          operator: "in",
          value: [KEYWORD_1, KEYWORD_2],
        },
      ]),
    ).toEqual(ids(0, 1))
    expect(
      await matching([
        { field: "keywordsReceived", operator: "notIn", value: [KEYWORD_1] },
      ]),
    ).toEqual(ids(1, 2, 3, 4))
  })

  test("email: the fixed noTopic bucket is separate from a real topic", async () => {
    expect(
      await matching([
        { field: "emailSent", operator: "in", value: ["noTopic"] },
      ]),
    ).toEqual(ids(3))
    expect(
      await matching([
        { field: "emailSent", operator: "in", value: [TOPIC_1] },
      ]),
    ).toEqual(ids(2))
    expect(
      await matching([
        { field: "emailSent", operator: "in", value: ["noTopic", TOPIC_1] },
      ]),
    ).toEqual(ids(2, 3))
    // The other phases have no rows at all.
    expect(
      await matching([{ field: "emailOpened", operator: "isNotEmpty" }]),
    ).toEqual([])
  })

  test("conditions combine with and / or", async () => {
    const flow = { field: "executedFlow", operator: "in", value: [FLOW_1] }
    const keyword = {
      field: "keywordsReceived",
      operator: "in",
      value: [KEYWORD_2],
    }
    expect(await matching([flow, keyword], "and")).toEqual(ids(1))
    expect(await matching([flow, keyword], "or")).toEqual(ids(0, 1))
  })

  test("a malformed condition matches nobody instead of everyone", async () => {
    expect(
      await matching([
        { field: "executedFlow", operator: "in", value: ["not-an-id"] },
      ]),
    ).toEqual([])
  })

  describe("sentMessage", () => {
    test.each([
      ["eq", "xin chao cac ban", [0]],
      ["eq", "Xin Chào Các Bạn", [0]],
      ["contains", "mua hang", [1]],
      ["contains", "MUA HÀNG", [1]],
      ["startsWith", "toi muon", [1]],
      ["endsWith", "cac ban", [0]],
      ["contains", "khong co", []],
    ])("%s %j is accent- and case-insensitive", async (operator, value, expected) => {
      expect(
        await matching([{ field: "sentMessage", operator, value }]),
      ).toEqual(ids(...expected))
    })

    test("Is Not / Doesn't contain are exact complements incl. contacts with no message", async () => {
      expect(
        await matching([
          { field: "sentMessage", operator: "ne", value: "xin chao cac ban" },
        ]),
      ).toEqual(ids(1, 2, 3, 4))
      expect(
        await matching([
          { field: "sentMessage", operator: "notContains", value: "hang" },
        ]),
      ).toEqual(ids(0, 2, 3, 4))
    })

    test("has no value / has a value", async () => {
      expect(
        await matching([{ field: "sentMessage", operator: "isEmpty" }]),
      ).toEqual(ids(2, 3, 4))
      expect(
        await matching([{ field: "sentMessage", operator: "isNotEmpty" }]),
      ).toEqual(ids(0, 1))
    })

    test("treats LIKE wildcards in the value literally", async () => {
      expect(
        await matching([
          { field: "sentMessage", operator: "contains", value: "%" },
        ]),
      ).toEqual([])
      expect(
        await matching([
          { field: "sentMessage", operator: "contains", value: "_" },
        ]),
      ).toEqual([])
    })
  })

  describe("lastDelivered", () => {
    test("compares on the stored timestamp", async () => {
      expect(
        await matching([
          { field: "lastDelivered", operator: "gt", value: "2026-05-19" },
        ]),
      ).toEqual(ids(1))
      expect(
        await matching([
          { field: "lastDelivered", operator: "eq", value: "2026-05-19" },
        ]),
      ).toEqual(ids(0))
      expect(
        await matching([
          {
            field: "lastDelivered",
            operator: "isBetween",
            value: ["2026-05-19", "2026-05-20"],
          },
        ]),
      ).toEqual(ids(0, 1))
    })

    test("Is Not / Not between include contacts that were never delivered to", async () => {
      expect(
        await matching([
          { field: "lastDelivered", operator: "ne", value: "2026-05-19" },
        ]),
      ).toEqual(ids(1, 2, 3, 4))
      expect(
        await matching([
          {
            field: "lastDelivered",
            operator: "notBetween",
            value: ["2026-05-19", "2026-05-19"],
          },
        ]),
      ).toEqual(ids(1, 2, 3, 4))
    })

    test("has no value / has a value", async () => {
      expect(
        await matching([{ field: "lastDelivered", operator: "isEmpty" }]),
      ).toEqual(ids(2, 3, 4))
      expect(
        await matching([{ field: "lastDelivered", operator: "isNotEmpty" }]),
      ).toEqual(ids(0, 1))
    })
  })
  describe("contactRepository.findIdsMatchingFilter (broadcast audience scan page)", () => {
    const filterFor = (conditions: Record<string, unknown>[]) =>
      ({ conditions, operator: "and" }) as never

    test("returns only the page's contacts that match, never another workspace's", async () => {
      const found = await contactRepository.findIdsMatchingFilter(
        {
          workspaceId: fixture.workspaceId,
          contactIds: [...fixture.contacts, fixture.foreignContact],
          contactFilter: filterFor([
            { field: "executedFlow", operator: "in", value: [FLOW_1] },
          ]),
        },
        database(),
      )

      expect([...found].sort()).toEqual(ids(0, 1))
    })

    test("evaluates negatives (NOT EXISTS) over the page, including contacts with no history", async () => {
      const found = await contactRepository.findIdsMatchingFilter(
        {
          workspaceId: fixture.workspaceId,
          contactIds: fixture.contacts,
          contactFilter: filterFor([
            { field: "executedFlow", operator: "notIn", value: [FLOW_1] },
          ]),
        },
        database(),
      )

      expect([...found].sort()).toEqual(ids(2, 3, 4))
    })

    test("ignores contacts outside the supplied page", async () => {
      const found = await contactRepository.findIdsMatchingFilter(
        {
          workspaceId: fixture.workspaceId,
          contactIds: [fixture.contacts[1] as string],
          contactFilter: filterFor([
            { field: "executedFlow", operator: "in", value: [FLOW_1] },
          ]),
        },
        database(),
      )

      expect(found).toEqual(ids(1))
    })

    test("fails closed for an unusable filter value and answers [] for an empty page", async () => {
      expect(
        await contactRepository.findIdsMatchingFilter(
          {
            workspaceId: fixture.workspaceId,
            contactIds: fixture.contacts,
            contactFilter: filterFor([
              { field: "executedFlow", operator: "in", value: ["not-an-id"] },
            ]),
          },
          database(),
        ),
      ).toEqual([])
      expect(
        await contactRepository.findIdsMatchingFilter(
          {
            workspaceId: fixture.workspaceId,
            contactIds: [],
            contactFilter: filterFor([
              { field: "executedFlow", operator: "in", value: [FLOW_1] },
            ]),
          },
          database(),
        ),
      ).toEqual([])
    })
  })
})
