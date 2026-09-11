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

const sql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): RecordedStatement => ({ strings: [...strings], values })

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
