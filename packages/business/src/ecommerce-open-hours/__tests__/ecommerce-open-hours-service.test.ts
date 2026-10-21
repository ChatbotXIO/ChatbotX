import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: (...args: unknown[]) => mocks.invalidate(...args),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  ecommerceOpenHoursRepository: {
    create: (...args: unknown[]) => mocks.create(...args),
    update: (...args: unknown[]) => mocks.update(...args),
    delete: (...args: unknown[]) => mocks.remove(...args),
  },
}))

const { ecommerceOpenHoursService } = await import("../service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("ecommerceOpenHoursService", () => {
  test("creates a schedule and drops the cached settings", async () => {
    mocks.create.mockResolvedValue({ id: "h1" })
    await ecommerceOpenHoursService.create({
      workspaceId: "ws1",
      name: "Weekdays",
      ranges: [{ day: 1, from: "09:00", to: "17:00" }],
    })
    expect(mocks.create).toHaveBeenCalledWith({
      workspaceId: "ws1",
      name: "Weekdays",
      ranges: [{ day: 1, from: "09:00", to: "17:00" }],
    })
    expect(mocks.invalidate).toHaveBeenCalledWith([
      "ecommerce-open-hours:ws1",
      "ecommerce-settings:ws1",
    ])
  })

  test("refuses a schedule without hours or with a bad time", async () => {
    await expect(
      ecommerceOpenHoursService.create({
        workspaceId: "ws1",
        name: "Empty",
        ranges: [],
      }),
    ).rejects.toThrow()
    await expect(
      ecommerceOpenHoursService.create({
        workspaceId: "ws1",
        name: "Bad",
        ranges: [{ day: 1, from: "9am", to: "17:00" }],
      }),
    ).rejects.toThrow()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  test("is a 404 for a schedule of another workspace", async () => {
    mocks.update.mockResolvedValue(undefined)
    await expect(
      ecommerceOpenHoursService.update({
        workspaceId: "ws1",
        openHoursId: "h9",
        data: { name: "X" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
