// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const store = vi.hoisted(() => ({ put: vi.fn(), take: vi.fn() }))

vi.mock("@chatbotx.io/redis", () => ({ distributedStore: store }))
vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))

const { templateInstallIntentService } = await import(
  "../src/template/install-intent"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("templateInstallIntentService", () => {
  test("remembers one choice per user for five minutes", async () => {
    await templateInstallIntentService.remember({
      userId: "7",
      shareToken: "tok",
    })

    expect(store.put).toHaveBeenCalledWith(
      "template-install-intent:7",
      "tok",
      300,
    )
  })

  test("take reads and deletes in one step", async () => {
    store.take.mockResolvedValue("tok")

    await expect(templateInstallIntentService.take("7")).resolves.toBe("tok")
    expect(store.take).toHaveBeenCalledWith("template-install-intent:7")
  })

  test("a Redis failure reads as no choice and never throws", async () => {
    store.take.mockRejectedValue(new Error("down"))
    store.put.mockRejectedValue(new Error("down"))

    await expect(templateInstallIntentService.take("7")).resolves.toBeNull()
    await expect(
      templateInstallIntentService.clear("7"),
    ).resolves.toBeUndefined()
    await expect(
      templateInstallIntentService.remember({ userId: "7", shareToken: "t" }),
    ).resolves.toBeUndefined()
  })
})
