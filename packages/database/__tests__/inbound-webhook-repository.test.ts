import { drizzle } from "drizzle-orm/node-postgres"
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { inboundWebhookRequestModel } from "../src/schema/inbound-webhook-request"

// ---------------------------------------------------------------------------
// inbound-webhook repositories. A real drizzle instance runs over a fake `pg`
// client that records the statement text and bound params, so what is pinned
// is the SQL that would reach Postgres: the atomic claim, the claim-token
// fence on every worker write, and the inbox/workspace scoping of the lookups.
// ---------------------------------------------------------------------------

type RecordedQuery = { text: string; params: unknown[] }

const recorded: RecordedQuery[] = []
let nextRows: unknown[][] = []

const fakeClient = {
  query: (
    config: string | { text: string; values?: unknown[] },
    params?: unknown[],
  ) => {
    const text = typeof config === "string" ? config : config.text
    recorded.push({
      text: text.replace(/\s+/g, " ").trim(),
      params:
        params ?? (typeof config === "string" ? [] : (config.values ?? [])),
    })
    // The rows belong to the statement under test, not to the transaction's BEGIN.
    const isTransactionControl = ["begin", "commit", "rollback"].includes(
      text.trim().toLowerCase(),
    )
    const rows = isTransactionControl ? [] : nextRows
    if (!isTransactionControl) {
      nextRows = []
    }
    return Promise.resolve({ rows, rowCount: rows.length, fields: [] })
  },
}

const tx = drizzle({ client: fakeClient as never }) as unknown as DatabaseClient

const {
  checkpointInboundWebhookRequest,
  claimInboundWebhookRequest,
  completeInboundWebhookRequest,
  deleteInboundWebhooks,
  failAbandonedInboundWebhookRequests,
  findInboundWebhookIntakeByToken,
  insertInboundWebhookRequest,
  listInboundWebhookRequestsPaginated,
  listInboundWebhooksPaginated,
  listStaleInboundWebhookRequests,
  purgeInboundWebhookRequests,
  releaseInboundWebhookRequest,
} = await import("../src/repositories/inbound-webhook/repository")
const { integrationWhatsappRepository } = await import(
  "../src/repositories/integration-whatsapp/repository"
)
const { contactInboxRepository } = await import(
  "../src/repositories/contact-inbox/repository"
)

/** The statements of a repository call, without the transaction's BEGIN/COMMIT. */
const statements = (): RecordedQuery[] =>
  recorded.filter(({ text }) => !["begin", "commit", "rollback"].includes(text))

const lastQuery = (): RecordedQuery => {
  const query = recorded.at(-1)
  if (!query) {
    throw new Error("no query was recorded")
  }
  return query
}

beforeEach(() => {
  recorded.length = 0
  nextRows = []
})

describe("claimInboundWebhookRequest", () => {
  const leaseExpiredBefore = new Date("2026-10-14T10:00:00.000Z")

  test("claims a received row or a processing row whose lease expired, in one UPDATE", async () => {
    const claimed = await claimInboundWebhookRequest(
      { id: "r-1", claimToken: "token-a", leaseExpiredBefore },
      tx,
    )

    expect(claimed).toBeNull()
    expect(recorded).toHaveLength(1)
    const { text, params } = lastQuery()
    expect(text.startsWith('update "InboundWebhookRequest" set')).toBe(true)
    expect(text).toContain(`"status" = $1`)
    expect(text).toContain(
      `"attempts" = "InboundWebhookRequest"."attempts" + 1`,
    )
    expect(text).toContain(`"id" = $`)
    expect(text).toContain(`("InboundWebhookRequest"."status" = $`)
    expect(text).toContain(`"InboundWebhookRequest"."claimedAt" < $`)
    expect(text).toContain("returning")
    expect(params).toContain("processing")
    expect(params).toContain("token-a")
    expect(params).toContain("received")
    expect(params).toContain(leaseExpiredBefore.toISOString())
  })
})

describe("fenced worker writes", () => {
  test.each([
    [
      "checkpoint",
      () =>
        checkpointInboundWebhookRequest(
          { id: "r-1", claimToken: "token-a", progress: { contactId: "c-1" } },
          tx,
        ),
    ],
    [
      "release",
      () =>
        releaseInboundWebhookRequest({ id: "r-1", claimToken: "token-a" }, tx),
    ],
    [
      "complete",
      () =>
        completeInboundWebhookRequest(
          {
            id: "r-1",
            claimToken: "token-a",
            completion: { status: "processed" },
          },
          tx,
        ),
    ],
  ])("%s only touches a processing row owned by the claim token", async (_name, run) => {
    nextRows = [["r-1"]]

    await expect(run()).resolves.toBe(true)

    const { text, params } = lastQuery()
    expect(text).toContain(`"InboundWebhookRequest"."status" = $`)
    expect(text).toContain(`"InboundWebhookRequest"."claimToken" = $`)
    expect(params).toContain("r-1")
    expect(params).toContain("processing")
    expect(params).toContain("token-a")
  })

  test.each([
    [
      "checkpoint",
      () =>
        checkpointInboundWebhookRequest(
          { id: "r-1", claimToken: "stale", progress: {} },
          tx,
        ),
    ],
    [
      "release",
      () =>
        releaseInboundWebhookRequest({ id: "r-1", claimToken: "stale" }, tx),
    ],
    [
      "complete",
      () =>
        completeInboundWebhookRequest(
          { id: "r-1", claimToken: "stale", completion: { status: "failed" } },
          tx,
        ),
    ],
  ])("%s reports false when the claim was lost", async (_name, run) => {
    await expect(run()).resolves.toBe(false)
  })

  test("checkpoint renews the lease even when there is no progress to record", async () => {
    nextRows = [["r-1"]]

    await expect(
      checkpointInboundWebhookRequest(
        { id: "r-1", claimToken: "t", progress: {} },
        tx,
      ),
    ).resolves.toBe(true)

    expect(lastQuery().text).toContain(`"claimedAt" = $1`)
  })

  test("release hands the row back to the pool", async () => {
    await releaseInboundWebhookRequest({ id: "r-1", claimToken: "t" }, tx)

    const { text, params } = lastQuery()
    expect(text).toContain(`"claimToken" = $`)
    expect(params).toContain("received")
    expect(params).toContain(null)
  })

  test("complete stamps processedAt and the terminal status", async () => {
    await completeInboundWebhookRequest(
      {
        id: "r-1",
        claimToken: "t",
        completion: { status: "skipped", skipReason: "inboxNotFound" },
      },
      tx,
    )

    const { text, params } = lastQuery()
    expect(text).toContain(`"processedAt" = $`)
    expect(params).toContain("skipped")
    expect(params).toContain("inboxNotFound")
  })
})

describe("insertInboundWebhookRequest", () => {
  const values = {
    workspaceId: "ws-1",
    inboundWebhookId: "w-1",
    idempotencyKey: "key-1",
    payload: { a: 1 },
  }

  test("ignores a duplicate idempotency key, returns null and leaves the counter alone", async () => {
    const inserted = await insertInboundWebhookRequest(values, tx)

    expect(inserted).toBeNull()
    const [insert, ...rest] = statements()
    expect(insert?.text).toContain("on conflict do nothing")
    expect(rest).toHaveLength(0)
  })

  test("counts an accepted request in the same transaction as its row", async () => {
    nextRows = [
      getTableConfig(inboundWebhookRequestModel).columns.map((column) =>
        column.name === "inboundWebhookId" ? "w-1" : null,
      ),
    ]

    const inserted = await insertInboundWebhookRequest(values, tx)

    expect(inserted?.inboundWebhookId).toBe("w-1")
    expect(recorded.map(({ text }) => text.split(" ")[0])).toEqual([
      "begin",
      "insert",
      "update",
      "commit",
    ])
    const { text, params } = statements()[1] as RecordedQuery
    expect(text).toContain(
      `"requestCount" = "InboundWebhook"."requestCount" + 1`,
    )
    // updatedAt is written back unchanged: a delivery is not a config change.
    expect(text).toContain(`"updatedAt" = "InboundWebhook"."updatedAt"`)
    expect(params).toContain("w-1")
  })
})

describe("listStaleInboundWebhookRequests", () => {
  const receivedBefore = new Date("2026-10-14T09:58:00.000Z")
  const leaseExpiredBefore = new Date("2026-10-14T09:45:00.000Z")
  const createdAfter = new Date("2026-10-13T10:00:00.000Z")

  test("selects unclaimed-for-too-long and lease-expired rows, oldest first", async () => {
    await listStaleInboundWebhookRequests(
      { receivedBefore, leaseExpiredBefore, createdAfter, limit: 500 },
      tx,
    )

    const { text, params } = lastQuery()
    expect(text).toContain(`"InboundWebhookRequest"."createdAt" < $`)
    expect(text).toContain(`"InboundWebhookRequest"."claimedAt" < $`)
    expect(text).toContain(`order by "InboundWebhookRequest"."createdAt" asc`)
    expect(params).toEqual(
      expect.arrayContaining([
        "received",
        "processing",
        receivedBefore.toISOString(),
        leaseExpiredBefore.toISOString(),
        500,
      ]),
    )
  })

  test("only returns requests younger than the give-up age", async () => {
    await listStaleInboundWebhookRequests(
      { receivedBefore, leaseExpiredBefore, createdAfter, limit: 10 },
      tx,
    )

    const { text, params } = lastQuery()
    expect(text).toContain(`"InboundWebhookRequest"."createdAt" > $`)
    expect(params).toContain(createdAfter.toISOString())
  })
})

describe("failAbandonedInboundWebhookRequests", () => {
  test("closes only unfinished requests older than the give-up age as abandoned", async () => {
    const createdBefore = new Date("2026-10-13T10:00:00.000Z")
    const receivedBefore = new Date("2026-10-14T09:58:00.000Z")
    const leaseExpiredBefore = new Date("2026-10-14T09:45:00.000Z")
    nextRows = [["r-1"], ["r-2"]]

    const closed = await failAbandonedInboundWebhookRequests(
      { createdBefore, receivedBefore, leaseExpiredBefore },
      tx,
    )

    expect(closed).toBe(2)
    const { text, params } = lastQuery()
    expect(text.startsWith('update "InboundWebhookRequest" set')).toBe(true)
    expect(text).toContain(`"InboundWebhookRequest"."createdAt" < $`)
    expect(params).toEqual(
      expect.arrayContaining([
        "failed",
        "abandoned",
        "received",
        "processing",
        createdBefore.toISOString(),
        leaseExpiredBefore.toISOString(),
      ]),
    )
  })
})

describe("workspace scoping", () => {
  test("deleteInboundWebhooks scopes by workspace and skips the query for no ids", async () => {
    await expect(
      deleteInboundWebhooks({ workspaceId: "ws-1", ids: [] }, tx),
    ).resolves.toEqual([])
    expect(recorded).toHaveLength(0)

    await deleteInboundWebhooks(
      { workspaceId: "ws-1", ids: ["w-1", "w-2"] },
      tx,
    )
    const { text, params } = lastQuery()
    expect(text).toContain(`"InboundWebhook"."workspaceId" = $`)
    expect(params).toEqual(expect.arrayContaining(["ws-1", "w-1", "w-2"]))
  })

  test("findInboundWebhookIntakeByToken is the one deliberately unscoped lookup, and reads four fields only", async () => {
    await findInboundWebhookIntakeByToken("iwh_abc", tx)

    const { text, params } = lastQuery()
    expect(text).not.toContain('workspaceId" = ')
    expect(params).toEqual(["iwh_abc", 1])
    // Never the config or the sample JSON: this row is what the cache stores.
    expect(text).toContain("IS NOT NULL")
    expect(text).not.toContain('"sampleJson"')
    expect(text).not.toContain('"fieldMappings"')
    expect(text).not.toContain('"identifiers"')
    expect(text).not.toContain('"token"  ')
  })
})

describe("list queries read summary columns only", () => {
  test("a request list never selects the payload, field errors or action results", async () => {
    await listInboundWebhookRequestsPaginated(
      { workspaceId: "ws-1", inboundWebhookId: "w-1", limit: 10, offset: 0 },
      tx,
    )

    const selects = recorded
      .map(({ text }) => text)
      .filter((text) => text.startsWith("select"))
    const list = selects.find((text) => text.includes('"status"')) ?? ""
    expect(list).not.toContain('"payload"')
    expect(list).not.toContain('"fieldErrors"')
    expect(list).not.toContain('"actionResults"')
    expect(list).not.toContain('"claimToken"')
  })

  test("a webhook list never selects the token, config or sample", async () => {
    await listInboundWebhooksPaginated(
      { workspaceId: "ws-1", limit: 10, offset: 0 },
      tx,
    )

    const list =
      recorded
        .map(({ text }) => text)
        .find((text) => text.includes('"InboundWebhook"."name"')) ?? ""
    expect(list).not.toContain('"token"')
    expect(list).not.toContain('"sampleJson"')
    expect(list).not.toContain('"fieldMappings"')
  })
})

describe("purgeInboundWebhookRequests", () => {
  test("deletes by age alone, so an abandoned in-flight request cannot leak", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })
    const client = await import("../src/client")
    const spy = vi.spyOn(client.db, "execute").mockImplementation(execute)

    await purgeInboundWebhookRequests({
      retentionDays: 30,
      chunkSize: 1000,
      interChunkDelayMs: 0,
      maxChunks: 10,
    })

    const rendered = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0])
    const text = rendered.sql.replace(/\s+/g, " ")
    expect(text).toContain(`"createdAt" < NOW() - make_interval(days => $1)`)
    expect(text).not.toContain("status")
    expect(text).toContain("FOR UPDATE SKIP LOCKED")
    expect(rendered.params).toEqual([30, 1000])
    spy.mockRestore()
  })
})

describe("integrationWhatsappRepository.listByDisplayPhoneDigits", () => {
  test("never matches an empty digit string (legacy rows default to '')", async () => {
    await expect(
      integrationWhatsappRepository.listByDisplayPhoneDigits(
        { workspaceId: "ws-1", digits: "" },
        tx,
      ),
    ).resolves.toEqual([])
    expect(recorded).toHaveLength(0)
  })

  test("compares digits only, inside one workspace, and fetches at most two rows", async () => {
    await integrationWhatsappRepository.listByDisplayPhoneDigits(
      { workspaceId: "ws-1", digits: "84901234567" },
      tx,
    )

    const { text, params } = lastQuery()
    expect(text).toContain(`"workspaceId" = $1`)
    expect(text).toContain(
      `regexp_replace("IntegrationWhatsapp"."displayPhoneNumber", '\\D', '', 'g') = $2`,
    )
    expect(params).toEqual(["ws-1", "84901234567", 2])
  })
})

describe("contactInboxRepository.findLatestByInboxAndContactIdentity", () => {
  test("matches one profile field on one inbox and one workspace, newest activity first", async () => {
    await contactInboxRepository.findLatestByInboxAndContactIdentity(
      {
        workspaceId: "ws-1",
        inboxId: "i-1",
        field: "phoneNumber",
        value: "+84901234567",
      },
      tx,
    )

    const { text, params } = lastQuery()
    expect(text).toContain(`"ContactInbox"."inboxId" = $1`)
    expect(text).toContain(`"Contact"."workspaceId" = $2`)
    expect(text).toContain(`"Contact"."phoneNumber" = $3`)
    expect(text).not.toContain(`"Contact"."email"`)
    expect(text).toContain("DESC NULLS LAST")
    expect(params.slice(0, 3)).toEqual(["i-1", "ws-1", "+84901234567"])
  })

  test("matches by email", async () => {
    await contactInboxRepository.findLatestByInboxAndContactIdentity(
      { workspaceId: "ws-1", inboxId: "i-1", field: "email", value: "a@b.co" },
      tx,
    )

    const { text } = lastQuery()
    expect(text).toContain(`"Contact"."email" = $3`)
    expect(text).not.toContain(`"Contact"."phoneNumber" =`)
  })
})

describe("contactInboxRepository.findByInboxAndFullName", () => {
  test("matches the normalised name on one inbox and one workspace, newest activity first", async () => {
    await contactInboxRepository.findByInboxAndFullName(
      { workspaceId: "ws-1", inboxId: "i-1", fullName: "An Nguyen" },
      tx,
    )

    const { text, params } = lastQuery()
    expect(text).toContain(`"ContactInbox"."inboxId" = $1`)
    expect(text).toContain(`"Contact"."workspaceId" = $2`)
    // Both sides are compared whitespace-collapsed and trimmed, so a stored
    // "John " (empty last name) matches "John".
    expect(text).toContain(
      `md5(btrim(regexp_replace("Contact"."fullName", '[ \\t\\n\\v\\f\\r]+', ' ', 'g'))) = md5($3)`,
    )
    expect(text).toContain(
      `btrim(regexp_replace("Contact"."fullName", '[ \\t\\n\\v\\f\\r]+', ' ', 'g')) = $4`,
    )
    expect(text).toContain("limit $5")
    expect(params).toEqual(["i-1", "ws-1", "An Nguyen", "An Nguyen", 2])
  })

  test("counts people, not connections: deduplicates by contact in SQL before the limit", async () => {
    // However many connections one person holds on the inbox, a second person
    // with the same name still comes back, so the caller sees the ambiguity.
    await contactInboxRepository.findByInboxAndFullName(
      { workspaceId: "ws-1", inboxId: "i-1", fullName: "An" },
      tx,
    )

    const { text } = lastQuery()
    expect(text).toContain(`group by "ContactInbox"."contactId"`)
    expect(text).toContain(
      `(array_agg("ContactInbox"."id" ORDER BY "ContactInbox"."lastMessageAt" DESC NULLS LAST, "ContactInbox"."id" DESC))[1]`,
    )
    expect(text).toContain(
      `max("ContactInbox"."lastMessageAt") DESC NULLS LAST`,
    )
  })

  test("returns no rows when nothing matches", async () => {
    await expect(
      contactInboxRepository.findByInboxAndFullName(
        { workspaceId: "ws-1", inboxId: "i-1", fullName: "Nobody" },
        tx,
      ),
    ).resolves.toEqual([])
  })
})
