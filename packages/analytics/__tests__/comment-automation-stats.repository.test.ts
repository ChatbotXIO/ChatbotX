import { beforeEach, describe, expect, test, vi } from "vitest"

// `sql` is faked as a recording template tag rather than kept real, so this
// package needs no drizzle dependency of its own: the static text the
// repository writes lands in `strings`, and every `${…}` lands in `values`,
// which is all these assertions look at.
//
// What the rendered statement itself must look like — no timezone name in the
// SQL text, both spellings offered as parameters, UTC fallback — is asserted
// where `resolvedTimezone` lives and where drizzle is already a dependency:
// `packages/database/__tests__/zoned-date-key.test.ts`. This file only pins the
// half that belongs to the repository: that the caller's timezone reaches that
// helper instead of being bound straight into the statement.
type RecordedStatement = { strings: string[]; values: unknown[] }

const execute = vi.fn().mockResolvedValue({ rows: [] })

type RecordedJoin = { parts: unknown[]; separator: unknown }

const sql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): RecordedStatement => ({ strings: [...strings], values })

// `sql.join` composes fragments, so the text it contributes lands in `values`
// rather than in the outer template's `strings`. `render` below flattens the
// whole tree back into one string, which is what a statement assembled from
// fragments — settleEvent's SET list, the VALUES rows — has to be asserted on.
sql.join = (parts: unknown[], separator: unknown): RecordedJoin => ({
  parts,
  separator,
})

const isRecordedStatement = (node: unknown): node is RecordedStatement =>
  typeof node === "object" && node !== null && "strings" in node

const isRecordedJoin = (node: unknown): node is RecordedJoin =>
  typeof node === "object" && node !== null && "parts" in node

/**
 * The SQL text a recorded statement stands for. Bound parameters contribute no
 * text — they are exactly what must NOT appear inline — so anything that is
 * neither a statement nor a join renders empty.
 */
const render = (node: unknown): string => {
  if (isRecordedJoin(node)) {
    return node.parts.map(render).join(render(node.separator))
  }
  if (isRecordedStatement(node)) {
    return node.strings
      .map((text, index) => text + render(node.values[index]))
      .join("")
  }
  return ""
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: { execute, query: {} },
  sql,
}))

// Stand-in for the drizzle fragment the real helper returns. Identity matters,
// not shape: an assertion only has to tell "went through the helper" apart from
// "was bound as a bare string", which is exactly what the bug did.
const resolvedTimezoneFragment = (timezone: string) => ({
  resolvedTimezoneFor: timezone,
})
const resolvedTimezone = vi.fn(resolvedTimezoneFragment)

vi.mock("@chatbotx.io/database/queries/date-bucket", () => ({
  resolvedTimezone,
}))

const { commentAutomationStatsRepository } = await import(
  "../src/repositories/postgres/comment-automation-stats.repository"
)

const lastStatement = (): RecordedStatement =>
  execute.mock.calls.at(-1)?.[0] as RecordedStatement

/** The full SQL text of the last statement, fragments included. */
const lastSql = (): string => render(lastStatement())

beforeEach(() => {
  vi.clearAllMocks()
  execute.mockResolvedValue({ rows: [] })
  resolvedTimezone.mockImplementation(resolvedTimezoneFragment)
})

describe("getRepliesByDate timezone handling", () => {
  const range = {
    workspaceId: "workspace-1",
    automationId: "automation-1",
    startDate: "2026-09-04T00:00:00.000Z",
    endDate: "2026-09-11T23:59:59.999Z",
  }

  // Regression: the browser's own `Intl` timezone name was bound straight into
  // `AT TIME ZONE`, and a PostgreSQL build packaged without the `backward`
  // tzdata file aborted the statement with 22023 "time zone not recognized".
  // Only this query takes a timezone, so the replies chart and the
  // replies-by-date table came back empty while the three panels beside them
  // kept working.
  test("routes the caller's timezone through resolvedTimezone", async () => {
    await commentAutomationStatsRepository.getRepliesByDate({
      ...range,
      timezone: "Asia/Saigon",
    })

    expect(resolvedTimezone).toHaveBeenCalledWith("Asia/Saigon")
  })

  test("binds the resolved fragment, never the timezone name itself", async () => {
    await commentAutomationStatsRepository.getRepliesByDate({
      ...range,
      timezone: "Asia/Saigon",
    })

    const { values } = lastStatement()

    expect(values).toContainEqual(resolvedTimezoneFragment("Asia/Saigon"))
    // The bug: `${timezone}` bound the raw name as a parameter of its own.
    expect(values).not.toContain("Asia/Saigon")
  })

  test("never writes the timezone name into the statement text", async () => {
    await commentAutomationStatsRepository.getRepliesByDate({
      ...range,
      timezone: "Asia/Saigon",
    })

    expect(lastStatement().strings.join("")).not.toContain("Asia/Saigon")
  })

  test("passes a canonical timezone name through unchanged too", async () => {
    await commentAutomationStatsRepository.getRepliesByDate({
      ...range,
      timezone: "Asia/Ho_Chi_Minh",
    })

    expect(resolvedTimezone).toHaveBeenCalledWith("Asia/Ho_Chi_Minh")
    expect(lastStatement().values).toContainEqual(
      resolvedTimezoneFragment("Asia/Ho_Chi_Minh"),
    )
  })
})

// The analytics date filter is unbounded — only FAILED rows are purged — so a
// `lifeTime` range can span years and the series is bucketed by month past 60
// days. The service picks the width; this query must honour what it was given,
// and the monthly branch must route its timezone through the same helper as the
// daily one (it was the daily branch that took the chart down once already).
describe("getRepliesByDate granularity", () => {
  const range = {
    workspaceId: "workspace-1",
    automationId: "automation-1",
    startDate: "2026-01-15T00:00:00.000Z",
    endDate: "2026-04-20T23:59:59.999Z",
    timezone: "Asia/Saigon",
  }

  test("groups by day by default", async () => {
    await commentAutomationStatsRepository.getRepliesByDate(range)

    const text = lastStatement().strings.join("")
    expect(text).toContain("'YYYY-MM-DD'")
    expect(text).not.toContain("DATE_TRUNC")
  })

  test("groups by month when asked, keying on the first of the month", async () => {
    await commentAutomationStatsRepository.getRepliesByDate({
      ...range,
      granularity: "month",
    })

    const text = lastStatement().strings.join("")
    expect(text).toContain("DATE_TRUNC('month'")
    expect(text).toContain("'YYYY-MM-01'")
  })

  test("routes the timezone through resolvedTimezone in the monthly branch too", async () => {
    await commentAutomationStatsRepository.getRepliesByDate({
      ...range,
      granularity: "month",
    })

    expect(resolvedTimezone).toHaveBeenCalledWith("Asia/Saigon")
    expect(lastStatement().values).toContainEqual(
      resolvedTimezoneFragment("Asia/Saigon"),
    )
    expect(lastStatement().strings.join("")).not.toContain("Asia/Saigon")
  })

  test("counts only successful replies, whichever bucket width", async () => {
    await commentAutomationStatsRepository.getRepliesByDate({
      ...range,
      granularity: "month",
    })

    expect(lastStatement().strings.join("")).toContain(`"status" = 'sent'`)
  })
})

// The three conditional writes behind the delivery counters. Each one's
// counter is driven by the rows it RETURNS, so a predicate that is too loose
// does not error — it just returns a row it should not have and the number on
// the list page is quietly wrong.
describe("markSeenForContactInboxes", () => {
  const items = [
    {
      contactInboxId: "inbox-1",
      occurredAt: new Date("2026-03-01T10:00:00.000Z"),
    },
  ]

  test("refuses to mark a reply delivered after the read receipt was sent", async () => {
    await commentAutomationStatsRepository.markSeenForContactInboxes(items)

    // Meta's `message_reads` is a per-conversation watermark: it says
    // everything up to T was read, so a reply delivered later cannot be one of
    // them. Without this, a receipt for an older DM marks a reply the contact
    // never opened and the drill-down shows a read time before the send time.
    expect(lastSql()).toContain(`event."deliveredAt" <= input."occurredAt"`)
  })

  test("stamps the receipt's own timestamp, never NOW()", async () => {
    await commentAutomationStatsRepository.markSeenForContactInboxes(items)

    const text = lastSql()
    expect(text).toContain(`SET "seenAt" = input."occurredAt"`)
    expect(text).not.toContain("ELSE NOW()")
  })

  test("still scopes to unseen, delivered, private rows — matching the index", async () => {
    await commentAutomationStatsRepository.markSeenForContactInboxes(items)

    const text = lastSql()
    expect(text).toContain(`event."replyChannel" = 'private'`)
    expect(text).toContain(`event."deliveredAt" IS NOT NULL`)
    expect(text).toContain(`event."seenAt" IS NULL`)
  })
})

describe("markClickedForAutomationContacts", () => {
  test("re-checks clickedAt on the UPDATE so two concurrent clicks count once", async () => {
    await commentAutomationStatsRepository.markClickedForAutomationContacts([
      {
        automationId: "automation-1",
        contactInboxId: "inbox-1",
        occurredAt: new Date("2026-03-01T10:00:00.000Z"),
      },
    ])

    // The LATERAL picks an unclicked row, but that snapshot is taken before the
    // row lock. Postgres re-checks the UPDATE's own WHERE after locking, which
    // is the only thing stopping both statements from claiming the same row.
    const text = lastSql()
    const updateClause = text.slice(text.indexOf("UPDATE"))
    expect(updateClause).toContain(`event."clickedAt" IS NULL`)
  })
})

describe("settleEvent", () => {
  const base = {
    automationId: "automation-1",
    commentId: "comment-1",
    replyChannel: "private",
  }

  test("clears failedAt when a row settles back to sent", async () => {
    await commentAutomationStatsRepository.settleEvent({
      ...base,
      status: "sent",
    })

    // An AI reply can record a failure and then land its text. Leaving the
    // stamp behind would keep the row in the Failed drill-down — which selects
    // on `failedAt IS NOT NULL` — even though it succeeded.
    const text = lastSql()
    expect(text).toContain(`"failedAt" = NULL`)
    expect(text).not.toContain(`"failedAt" = NOW()`)
  })

  test("stamps failedAt on a failure, and refuses a row already settled", async () => {
    await commentAutomationStatsRepository.settleEvent({
      ...base,
      status: "failed",
    })

    const text = lastSql()
    expect(text).toContain(`"failedAt" = NOW()`)
    // The conditional half: a second failure must not be counted again.
    expect(text).toContain(`"failedAt" IS NULL`)
    expect(text).toContain(`"deliveredAt" IS NULL`)
  })
})
