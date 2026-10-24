import { BOUNDED_COUNT_CAP } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  setLocalStatementTimeout: vi.fn(),
  isStatementTimeoutError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  setLocalStatementTimeout: mocks.setLocalStatementTimeout,
  isStatementTimeoutError: mocks.isStatementTimeoutError,
}))

const { countByMode } = await import("../src/count-mode")

const tx = { id: "tx" }

beforeEach(() => {
  mocks.transaction.mockReset()
  mocks.setLocalStatementTimeout.mockReset()
  mocks.isStatementTimeoutError.mockReset()
  mocks.transaction.mockImplementation(
    async (run: (client: unknown) => Promise<unknown>) => await run(tx),
  )
})

describe("countByMode", () => {
  test("defaults to an exact count under the statement timeout", async () => {
    const exact = vi.fn().mockResolvedValue(1234)
    const bounded = vi.fn()

    const result = await countByMode({ mode: undefined, exact, bounded })

    expect(result).toEqual({ total: 1234, totalCountCapped: false })
    expect(exact).toHaveBeenCalledWith(tx)
    expect(bounded).not.toHaveBeenCalled()
    expect(mocks.setLocalStatementTimeout).toHaveBeenCalledWith(tx, "30s")
  })

  test("bounded mode passes the server cap and reports a lower bound", async () => {
    const bounded = vi
      .fn()
      .mockResolvedValue({ total: BOUNDED_COUNT_CAP, capped: true })
    const exact = vi.fn()

    const result = await countByMode({ mode: "bounded", exact, bounded })

    expect(result).toEqual({
      total: BOUNDED_COUNT_CAP,
      totalCountCapped: true,
      countCap: BOUNDED_COUNT_CAP,
    })
    expect(bounded).toHaveBeenCalledWith(BOUNDED_COUNT_CAP, tx)
    expect(exact).not.toHaveBeenCalled()
    expect(mocks.setLocalStatementTimeout).toHaveBeenCalledWith(tx, "30s")
  })

  test("bounded mode under the cap is not flagged capped", async () => {
    const result = await countByMode({
      mode: "bounded",
      exact: vi.fn(),
      bounded: vi.fn().mockResolvedValue({ total: 7, capped: false }),
    })

    expect(result).toEqual({
      total: 7,
      totalCountCapped: false,
      countCap: BOUNDED_COUNT_CAP,
    })
  })

  test.each([
    "exact",
    "bounded",
  ] as const)("%s mode turns a statement timeout into the typed 503", async (mode) => {
    const timeout = new Error("canceling statement due to statement timeout")
    mocks.isStatementTimeoutError.mockReturnValue(true)

    await expect(
      countByMode({
        mode,
        exact: vi.fn().mockRejectedValue(timeout),
        bounded: vi.fn().mockRejectedValue(timeout),
      }),
    ).rejects.toMatchObject({ code: "countTimeout", httpStatusCode: 503 })
  })

  test("rethrows a non-timeout failure untouched", async () => {
    const failure = new Error("connection reset")
    mocks.isStatementTimeoutError.mockReturnValue(false)

    await expect(
      countByMode({
        mode: "exact",
        exact: vi.fn().mockRejectedValue(failure),
        bounded: vi.fn(),
      }),
    ).rejects.toBe(failure)
  })
})
