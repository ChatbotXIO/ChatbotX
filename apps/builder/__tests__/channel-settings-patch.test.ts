// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  lockKeys: [] as string[],
  assertAllExist: vi.fn(),
  findIntegrationMessenger: vi.fn(),
  findIntegrationInstagram: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: async ({
      key,
      fn,
    }: {
      key: string
      fn: () => Promise<unknown>
    }) => {
      mocks.lockKeys.push(key)
      return await fn()
    },
  },
  distributedStore: {},
}))
vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(),
  flowService: { assertAllExist: mocks.assertAllExist },
  inboxService: {},
  instagramIntegrationService: {},
  messengerIntegrationService: {},
}))
vi.mock("@chatbotx.io/integration-messenger", () => ({ integration: {} }))
vi.mock("@chatbotx.io/integration-instagram", () => ({ integration: {} }))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: {},
}))
vi.mock("@/features/integration-messenger/queries", () => ({
  findIntegrationMessenger: mocks.findIntegrationMessenger,
}))
vi.mock("@/features/integration-instagram/queries", () => ({
  findIntegrationInstagram: mocks.findIntegrationInstagram,
}))
vi.mock("@/features/integration-webchat/lib", () => ({
  getBrandingUrl: vi.fn(),
}))
vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const { mergeMessengerSettings, patchMessengerSettings, updateMessenger } =
  await import("@/features/integration-messenger/lib/update-messenger-settings")
const { mergeInstagramSettings, patchInstagramSettings } = await import(
  "@/features/integration-instagram/lib/update-instagram-settings"
)

const STOP = new Error("stop after the merge")
const saved = {
  welcomeFlowId: "10",
  persistentMenus: [{ type: "flow" as const, label: "Menu", flowId: "11" }],
  personas: [],
  conversationStarters: [{ question: "Hi?", flowId: "12" }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lockKeys.length = 0
  mocks.assertAllExist.mockRejectedValue(STOP)
})

describe("mergeMessengerSettings / mergeInstagramSettings", () => {
  test("keep what is not sent, take what is sent, null clears", () => {
    expect(mergeMessengerSettings(saved, { welcomeFlowId: null })).toEqual({
      ...saved,
      welcomeFlowId: null,
    })
    expect(mergeInstagramSettings(saved, { conversationStarters: [] })).toEqual(
      {
        welcomeFlowId: "10",
        persistentMenus: saved.persistentMenus,
        conversationStarters: [],
      },
    )
  })
})

describe("partial writers", () => {
  test("Messenger reads the saved settings under the page's lock and writes the merge", async () => {
    mocks.findIntegrationMessenger.mockResolvedValue(saved)

    await expect(
      patchMessengerSettings(
        { workspaceId: "ws-1", id: "im-1" },
        {
          welcomeFlowId: "20",
        },
      ),
    ).rejects.toBe(STOP)

    expect(mocks.lockKeys).toEqual(["messenger-settings:im-1"])
    expect(mocks.findIntegrationMessenger).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "im-1",
    })
    expect(mocks.assertAllExist).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowIds: ["20", "11", "12"],
    })
  })

  test("Instagram uses its own per-account lock", async () => {
    mocks.findIntegrationInstagram.mockResolvedValue(saved)

    await expect(
      patchInstagramSettings(
        { workspaceId: "ws-1", id: "ig-1" },
        {
          persistentMenus: [],
        },
      ),
    ).rejects.toBe(STOP)

    expect(mocks.lockKeys).toEqual(["instagram-settings:ig-1"])
    expect(mocks.assertAllExist).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowIds: ["10", "12"],
    })
  })

  test("the full replace takes the same lock as the partial update", async () => {
    await expect(
      updateMessenger({ workspaceId: "ws-1", id: "im-1" }, saved),
    ).rejects.toBe(STOP)

    expect(mocks.lockKeys).toEqual(["messenger-settings:im-1"])
  })

  test("two default personas are refused before anything is written", async () => {
    const persona = {
      id: "",
      name: "A",
      isDefault: true,
      profilePicture: {
        id: "1",
        url: "https://x.io/a.png",
        mode: "url" as const,
      },
    }

    await expect(
      updateMessenger(
        { workspaceId: "ws-1", id: "im-1" },
        { ...saved, personas: [persona, { ...persona, name: "B" }] },
      ),
    ).rejects.toMatchObject({ code: "validation", field: "personas" })
    expect(mocks.assertAllExist).not.toHaveBeenCalled()
  })
})
