import { describe, expect, test } from "vitest"
import { type DatabaseClient, db } from "../src/client"
import {
  facebookMarketingMessageRepository as campaigns,
  facebookMarketingMessageRecipientRepository as recipients,
} from "../src/repositories/facebook-marketing-messages"

// Renders the SQL each repository call would run, without a database: the
// real drizzle builders are wrapped so awaiting them records `toSQL()` and
// resolves to `[]` instead of executing. Parens, table qualifiers and the
// RETURNING list are dropped so the assertions read like the predicate.
const RETURNING = / returning .*$/
const QUALIFIER = /"FacebookMarketingMessage(Recipient)?"\./g
const PARENS = /[()]/g
const SPACES = /\s+/g

const CLAIM_PENDING = /"id" = \$\d+ and "status" = \$\d+/
const CLAIM_DUE = /"nextAttemptAt" is null or "nextAttemptAt" <= \$\d+/
const CLAIM_CAMPAIGN_SENDING =
  /exists select 1 from "FacebookMarketingMessage" where "id" = "campaignRowId" and "status" = 'sending'/
const ONLY_IF_UNCONFIRMED = /where "id" = \$\d+ and "status" = \$\d+$/
const ONE_STATUS = /"status" in \$\d+$/
const TWO_STATUSES = /"status" in \$\d+, \$\d+$/
const NOTHING_SENT = /"firstSentAt" is null/
const DUE_TO_START =
  /"status" = \$\d+ and "startsAt" <= \$\d+ and "nextDayAt" is null or "nextDayAt" <= \$\d+ or "status" = \$\d+ and "nextDayAt" <= \$\d+$/

function capture(): { tx: DatabaseClient; queries: string[] } {
  const queries: string[] = []
  const wrap = (builder: object): unknown =>
    new Proxy(builder, {
      get(target, prop) {
        if (prop === "then") {
          const { sql } = (target as { toSQL: () => { sql: string } }).toSQL()
          queries.push(
            sql
              .replace(RETURNING, "")
              .replace(QUALIFIER, "")
              .replace(PARENS, "")
              .replace(SPACES, " "),
          )
          return (resolve: (value: unknown) => void) => resolve([])
        }
        const value = Reflect.get(target, prop)
        return typeof value === "function"
          ? (...args: unknown[]) => wrap(value.apply(target, args))
          : value
      },
    })
  const tx = {
    update: (table: never) => wrap(db.update(table)),
    select: (fields?: never) => wrap(db.select(fields)),
  } as unknown as DatabaseClient
  return { tx, queries }
}

describe("recipient claimForSend", () => {
  test("only claims a due pending row of a campaign that is still sending", async () => {
    const { tx, queries } = capture()
    const row = await recipients.claimForSend({ id: "r1", now: new Date() }, tx)
    expect(row).toBeNull()
    const sql = queries[0] ?? ""
    expect(sql).toMatch(CLAIM_PENDING)
    expect(sql).toMatch(CLAIM_DUE)
    expect(sql).toMatch(CLAIM_CAMPAIGN_SENDING)
  })
})

describe("recipient settleSend", () => {
  test("only updates a row that is still unconfirmed (a webhook result wins)", async () => {
    const { tx, queries } = capture()
    await recipients.settleSend({ id: "r1", status: "sent" }, tx)
    expect(queries[0]).toMatch(ONLY_IF_UNCONFIRMED)
  })
})

describe("recipient failRemaining", () => {
  test("can be limited to given statuses", async () => {
    const { tx, queries } = capture()
    await recipients.failRemaining(
      {
        campaignRowId: "c1",
        statuses: ["unconfirmed"],
        errorCode: null,
        errorMessage: "outcomeUnknown",
        now: new Date(),
      },
      tx,
    )
    expect(queries[0]).toMatch(ONE_STATUS)
  })
})

describe("campaign update", () => {
  const base = {
    id: "c1",
    workspaceId: "w1",
    name: "n",
    budgetType: "daily" as const,
    budgetMinorUnits: 100,
  }

  test("a content change only applies while nothing was sent and the campaign has not started", async () => {
    const { tx, queries } = capture()
    await campaigns.update(
      { ...base, content: { a: 1 }, lockContent: true },
      tx,
    )
    expect(queries[0]).toContain('"content" = $')
    expect(queries[0]).toMatch(NOTHING_SENT)
    expect(queries[0]).toMatch(TWO_STATUSES)
  })

  test("a name/budget-only edit is unconditional and leaves content alone", async () => {
    const { tx, queries } = capture()
    await campaigns.update(base, tx)
    expect(queries[0]).not.toContain('"content"')
    expect(queries[0]).not.toMatch(NOTHING_SENT)
  })
})

describe("campaign listDueToStart", () => {
  test("a scheduled campaign waits for its retry backoff (nextDayAt)", async () => {
    const { tx, queries } = capture()
    await campaigns.listDueToStart(new Date(), tx)
    expect(queries[0]).toMatch(DUE_TO_START)
  })
})
