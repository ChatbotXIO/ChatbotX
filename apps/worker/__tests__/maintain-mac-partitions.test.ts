import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const dbExecute = vi.fn(async () => ({ rows: [{ exists: false }] }))
const sql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
  {
    identifier: (value: string) => ({ identifier: value }),
    raw: (value: string) => ({ raw: value }),
  },
)

vi.mock("@chatbotx.io/database/client", () => ({
  db: { execute: dbExecute },
  sql,
}))

const logger = { error: vi.fn(), info: vi.fn() }
vi.mock("../src/lib/logger", () => ({ logger }))

const { maintainMacPartitions } = await import(
  "../src/schedule/handlers/maintain-mac-partitions"
)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"))
  dbExecute.mockClear()
  logger.error.mockClear()
  logger.info.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("maintainMacPartitions", () => {
  test("creates yearly monthly-ledger partitions and current/future hourly partitions", async () => {
    await maintainMacPartitions()

    const existenceChecks = dbExecute.mock.calls
      .map(([query]) => query as { values: unknown[] })
      .filter((query) => typeof query.values[0] === "string")
      .map((query) => query.values[0])

    expect(existenceChecks).toEqual([
      "ContactActiveMonthly_2026",
      "ContactActiveMonthly_2027",
      "ContactActiveHourly_2026_06",
      "ContactActiveHourly_2026_07",
      "ContactActiveHourly_2026_08",
    ])
    expect(logger.info).toHaveBeenCalledWith(
      "[maintainMacPartitions] yearlyCreated=2 hourlyCreated=3",
    )
    expect(logger.error).not.toHaveBeenCalled()
  })
})
