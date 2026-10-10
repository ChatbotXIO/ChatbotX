// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  lockKeys: [] as string[],
  lockTails: new Map<string, Promise<unknown>>(),
  assertAllExist: vi.fn(),
  findIntegrationMessenger: vi.fn(),
  findIntegrationInstagram: vi.fn(),
  updateInstagramProfileFields: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    // Serializes per key like the Redis lock, so interleaving tests see
    // the second writer wait for the first.
    runExclusive: ({
      key,
      fn,
    }: {
      key: string
      fn: () => Promise<unknown>
    }) => {
      mocks.lockKeys.push(key)
      const run = (mocks.lockTails.get(key) ?? Promise.resolve()).then(fn)
      mocks.lockTails.set(
        key,
        run.catch(() => undefined),
      )
      return run
    },
  },
  distributedStore: {},
}))
vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async () => ({ platform: { appUrl: "" } })),
  flowService: { assertAllExist: mocks.assertAllExist },
  inboxService: {},
  instagramIntegrationService: {
    updateProfileFields: mocks.updateInstagramProfileFields,
  },
  messengerIntegrationService: {},
}))
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (fn: (tx: Record<string, never>) => Promise<unknown>) =>
      fn({}),
  },
  findOrFail: vi.fn(async () => ({ id: "fv-1" })),
}))
vi.mock("@chatbotx.io/integration-messenger", () => ({ integration: {} }))
vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: { runChannelHandler: vi.fn() },
}))
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
const { mergeInstagramSettings, patchInstagramSettings, updateInstagram } =
  await import("@/features/integration-instagram/lib/update-instagram-settings")

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
  mocks.lockTails.clear()
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

describe("concurrent writes to one account", () => {
  /** A saved Instagram account whose writes take a moment, like a real one. */
  const useStoredAccount = () => {
    let stored = {
      inboxId: "inbox-1",
      type: "instagram",
      auth: {},
      welcomeFlowId: "10" as string | null,
      persistentMenus: [] as never[],
      conversationStarters: [] as { question: string; flowId: string }[],
    }
    mocks.assertAllExist.mockResolvedValue(undefined)
    mocks.findIntegrationInstagram.mockImplementation(async () => ({
      ...stored,
    }))
    mocks.updateInstagramProfileFields.mockImplementation(
      async (_ref: unknown, fields: Partial<typeof stored>) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        stored = { ...stored, ...fields }
      },
    )
    return () => stored
  }
  const ref = { workspaceId: "ws-1", id: "ig-1" }
  const starters = [{ question: "New?", flowId: "13" }]

  test("two partial updates sent at once both survive", async () => {
    const read = useStoredAccount()

    await Promise.all([
      patchInstagramSettings(ref, { welcomeFlowId: "20" }),
      patchInstagramSettings(ref, { conversationStarters: starters }),
    ])

    expect(read()).toMatchObject({
      welcomeFlowId: "20",
      conversationStarters: starters,
    })
  })

  test("a partial update sent during a full replace merges onto the replace", async () => {
    const read = useStoredAccount()

    await Promise.all([
      updateInstagram(ref, {
        welcomeFlowId: null,
        persistentMenus: [],
        conversationStarters: starters,
      }),
      patchInstagramSettings(ref, { welcomeFlowId: "20" }),
    ])

    expect(read()).toMatchObject({
      welcomeFlowId: "20",
      conversationStarters: starters,
    })
  })
})
