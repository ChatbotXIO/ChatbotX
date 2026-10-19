import { describe, expect, test, vi } from "vitest"

const warn = vi.hoisted(() => vi.fn())
vi.mock("../src/logger", () => ({ logger: { warn } }))

const { resolveWorkingHoursTimezone } = await import(
  "../src/working-hours/timezone"
)

describe("resolveWorkingHoursTimezone", () => {
  test("returns a valid IANA zone unchanged", () => {
    expect(resolveWorkingHoursTimezone({ timezone: "Asia/Ho_Chi_Minh" })).toBe(
      "Asia/Ho_Chi_Minh",
    )
    expect(warn).not.toHaveBeenCalled()
  })

  test("invalid zone -> UTC and warns with the err key", () => {
    expect(
      resolveWorkingHoursTimezone({ id: "ws", timezone: "Mars/Base" }),
    ).toBe("UTC")
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), workspaceId: "ws" }),
      expect.any(String),
    )
  })

  test("missing zone -> UTC without a warning", () => {
    warn.mockClear()
    expect(resolveWorkingHoursTimezone({ timezone: null })).toBe("UTC")
    expect(warn).not.toHaveBeenCalled()
  })
})
