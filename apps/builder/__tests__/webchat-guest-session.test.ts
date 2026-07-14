// @vitest-environment node

import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { hmacSha256Hex, timingSafeStringEqual } from "@chatbotx.io/utils/crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { shouldTriggerWelcomeFlow } from "@/features/integration-webchat/components/webchat-welcome-flow"
import {
  getParentOriginFromUrl,
  isOriginAuthorized,
} from "@/features/integration-webchat/lib/authorized-domain"
import {
  createWebchatAccessToken,
  verifyWebchatAccessToken,
} from "@/features/integration-webchat/lib/webchat-access-token"
import {
  createGuestSessionStore,
  toWebchatClientConfig,
} from "@/features/integration-webchat/providers/store/guest-sesssion-store"
import {
  buildGuestStorageKey,
  createGuestConversationId,
  GUEST_CONVERSATION_ID_KEY,
  readLegacyGuestId,
  safeStorageGet,
  safeStorageSet,
} from "@/features/integration-webchat/providers/store/lib/guest-session"
import { checkGuestRateLimit } from "@/lib/rate-limit/guest-rate-limit"

vi.mock("@/features/messages/actions/create-webchat-message.action", () => ({
  createWebchatMessageAction: {},
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => "generated-id") }
})

const createLocalStorageMock = (initial: Record<string, string> = {}) => {
  const items = new Map(Object.entries(initial))

  return {
    getItem: vi.fn((key: string) => items.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      items.set(key, value)
    }),
    items,
  }
}

const createWebchatConfig = (
  overrides: Partial<IntegrationWebchatModel> = {},
) =>
  ({
    id: "webchat-1",
    workspaceId: "workspace-1",
    persistentMenus: [],
    ...overrides,
  }) as IntegrationWebchatModel

describe("webchat guest session helpers", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  test("builds a storage key scoped to workspace and webchat", () => {
    expect(buildGuestStorageKey("workspace-1", "webchat-1")).toBe(
      "x-conversation-id:workspace-1:webchat-1",
    )
  })

  test("creates a guest conversation id scoped to the workspace", () => {
    expect(createGuestConversationId("workspace-1")).toBe(
      "workspace-1:generated-id",
    )
  })

  test("falls back to memory storage when localStorage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => {
        throw new Error("storage blocked")
      }),
      setItem: vi.fn(() => {
        throw new Error("storage blocked")
      }),
    })

    safeStorageSet("blocked-storage-key", "guest-1")

    expect(safeStorageGet("blocked-storage-key")).toBe("guest-1")
  })

  test("reads the legacy global guest conversation id", () => {
    vi.stubGlobal(
      "localStorage",
      createLocalStorageMock({ [GUEST_CONVERSATION_ID_KEY]: "legacy-guest" }),
    )

    expect(readLegacyGuestId()).toBe("legacy-guest")
  })
})

describe("webchat guest session store", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  test("creates a new scoped session on first initialization", () => {
    const localStorageMock = createLocalStorageMock()
    vi.stubGlobal("localStorage", localStorageMock)

    const store = createGuestSessionStore(createWebchatConfig())

    store.getState().initGuestSession()

    const state = store.getState()
    const scopedKey = buildGuestStorageKey("workspace-1", "webchat-1")
    expect(state.guestConversationId).toBe("workspace-1:generated-id")
    expect(state.isNewGuestSession).toBe(true)
    expect(localStorageMock.items.get(scopedKey)).toBe(
      "workspace-1:generated-id",
    )
  })

  test("reuses an existing scoped session without marking it new", () => {
    const scopedKey = buildGuestStorageKey("workspace-1", "webchat-1")
    vi.stubGlobal(
      "localStorage",
      createLocalStorageMock({ [scopedKey]: "workspace-1:existing-guest" }),
    )

    const store = createGuestSessionStore(createWebchatConfig())

    store.getState().initGuestSession()

    const state = store.getState()
    expect(state.guestConversationId).toBe("workspace-1:existing-guest")
    expect(state.isNewGuestSession).toBe(false)
  })

  test("migrates a legacy global session without marking it new", () => {
    const localStorageMock = createLocalStorageMock({
      [GUEST_CONVERSATION_ID_KEY]: "workspace-1:legacy-guest",
    })
    vi.stubGlobal("localStorage", localStorageMock)

    const store = createGuestSessionStore(createWebchatConfig())

    store.getState().initGuestSession()

    const scopedKey = buildGuestStorageKey("workspace-1", "webchat-1")
    const state = store.getState()
    expect(state.guestConversationId).toBe("workspace-1:legacy-guest")
    expect(state.isNewGuestSession).toBe(false)
    expect(localStorageMock.items.get(scopedKey)).toBe(
      "workspace-1:legacy-guest",
    )
  })

  test("keeps guest sessions isolated across webchat ids", () => {
    const localStorageMock = createLocalStorageMock()
    vi.stubGlobal("localStorage", localStorageMock)

    const firstStore = createGuestSessionStore(
      createWebchatConfig({ id: "webchat-1" }),
    )
    const secondStore = createGuestSessionStore(
      createWebchatConfig({ id: "webchat-2" }),
    )

    firstStore.getState().initGuestSession()
    secondStore.getState().initGuestSession()

    expect(
      localStorageMock.items.has(
        buildGuestStorageKey("workspace-1", "webchat-1"),
      ),
    ).toBe(true)
    expect(
      localStorageMock.items.has(
        buildGuestStorageKey("workspace-1", "webchat-2"),
      ),
    ).toBe(true)
  })
})

describe("webchat welcome flow trigger", () => {
  test("fires only for a new guest session with a welcome flow and no ref", () => {
    expect(
      shouldTriggerWelcomeFlow({
        guestConversationId: "guest-1",
        hasRef: false,
        isNewGuestSession: true,
        welcomeFlowId: "flow-1",
      }),
    ).toBe(true)

    expect(
      shouldTriggerWelcomeFlow({
        guestConversationId: "guest-1",
        hasRef: false,
        isNewGuestSession: false,
        welcomeFlowId: "flow-1",
      }),
    ).toBe(false)

    expect(
      shouldTriggerWelcomeFlow({
        guestConversationId: "guest-1",
        hasRef: true,
        isNewGuestSession: true,
        welcomeFlowId: "flow-1",
      }),
    ).toBe(false)

    expect(
      shouldTriggerWelcomeFlow({
        guestConversationId: "guest-1",
        hasRef: false,
        isNewGuestSession: true,
        welcomeFlowId: null,
      }),
    ).toBe(false)
  })
})

describe("webchat authorized domains", () => {
  test("allows all origins when no domains are configured", () => {
    expect(isOriginAuthorized("https://example.com", [])).toBe(true)
    expect(isOriginAuthorized(null, [])).toBe(true)
  })

  test("allows exact hosts and subdomains", () => {
    expect(isOriginAuthorized("https://example.com", ["example.com"])).toBe(
      true,
    )
    expect(isOriginAuthorized("https://www.example.com", ["example.com"])).toBe(
      true,
    )
  })

  test("rejects mismatched or missing origins when domains are configured", () => {
    expect(isOriginAuthorized("https://attacker.test", ["example.com"])).toBe(
      false,
    )
    expect(isOriginAuthorized(null, ["example.com"])).toBe(false)
  })

  test("extracts a parent origin from a webchat referer URL", () => {
    expect(
      getParentOriginFromUrl(
        "https://builder.test/webchat?parentOrigin=https%3A%2F%2Fexample.com",
      ),
    ).toBe("https://example.com")
  })
})

describe("webchat guest rate limit", () => {
  const createMemoryRateLimitStore = () => {
    const counts = new Map<string, number>()

    return {
      incrementCounter: vi.fn((key: string, delta: number) => {
        const next = (counts.get(key) ?? 0) + delta
        counts.set(key, next)
        return Promise.resolve(next)
      }),
      setNumberIfNotExists: vi.fn((key: string, value: number) => {
        if (counts.has(key)) {
          return Promise.resolve(false)
        }
        counts.set(key, value)
        return Promise.resolve(true)
      }),
    }
  }

  test("limits after the per-ip window is exceeded", async () => {
    const store = createMemoryRateLimitStore()
    let result = { limited: false, retryAfter: 0 }

    for (let index = 0; index < 61; index += 1) {
      result = await checkGuestRateLimit({
        clientIp: "192.0.2.1",
        store,
        webchatId: "webchat-1",
      })
    }

    expect(result.limited).toBe(true)
  })

  test("limits after the per-session burst window is exceeded", async () => {
    const store = createMemoryRateLimitStore()
    let result = { limited: false, retryAfter: 0 }

    for (let index = 0; index < 21; index += 1) {
      result = await checkGuestRateLimit({
        clientIp: "192.0.2.1",
        guestConversationId: "guest-1",
        store,
        webchatId: "webchat-1",
      })
    }

    expect(result.limited).toBe(true)
  })

  test("uses a local fallback limiter when the backing store throws", async () => {
    const failingStore = {
      incrementCounter: vi.fn(() => Promise.reject(new Error("redis down"))),
      setNumberIfNotExists: vi.fn(() =>
        Promise.reject(new Error("redis down")),
      ),
    }
    let result = { limited: false, retryAfter: 0 }

    for (let index = 0; index < 61; index += 1) {
      result = await checkGuestRateLimit({
        clientIp: "192.0.2.200",
        store: failingStore,
        webchatId: "webchat-fallback",
      })
    }

    expect(result.limited).toBe(true)
  })
})

describe("webchat access token", () => {
  const baseInput = {
    workspaceId: "workspace-1",
    webchatId: "webchat-1",
    origin: "https://example.com",
  }

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret"
  })

  test("round-trips an anonymous session with a null verified external id", async () => {
    const token = await createWebchatAccessToken(baseInput)

    const result = await verifyWebchatAccessToken({ ...baseInput, token })

    expect(result.authorized).toBe(true)
    expect(result.verifiedExternalId).toBeNull()
  })

  test("round-trips a verified external id in the signed payload", async () => {
    const token = await createWebchatAccessToken({
      ...baseInput,
      verifiedExternalId: "external-42",
    })

    const result = await verifyWebchatAccessToken({ ...baseInput, token })

    expect(result.authorized).toBe(true)
    expect(result.verifiedExternalId).toBe("external-42")
  })

  test("rejects a missing token", async () => {
    const result = await verifyWebchatAccessToken({
      ...baseInput,
      token: null,
    })

    expect(result.authorized).toBe(false)
    expect(result.verifiedExternalId).toBeNull()
  })

  test("rejects a token whose workspace does not match", async () => {
    const token = await createWebchatAccessToken(baseInput)

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      workspaceId: "workspace-2",
      token,
    })

    expect(result.authorized).toBe(false)
    expect(result.verifiedExternalId).toBeNull()
  })

  test("rejects a tampered signature and does not leak the external id", async () => {
    const token = await createWebchatAccessToken({
      ...baseInput,
      verifiedExternalId: "external-42",
    })
    const [payload] = token.split(".")

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      token: `${payload}.deadbeef`,
    })

    expect(result.authorized).toBe(false)
    expect(result.verifiedExternalId).toBeNull()
  })
})

describe("webchat identity verification", () => {
  const identitySecret = "identity-secret-abc"
  const externalId = "customer-external-99"

  const verifyIdentity = async ({
    secret,
    suppliedExternalId,
    suppliedHash,
  }: {
    secret: string | null
    suppliedExternalId?: string
    suppliedHash?: string
  }) => {
    if (suppliedExternalId && suppliedHash && secret) {
      const expected = await hmacSha256Hex(secret, suppliedExternalId)
      return timingSafeStringEqual(suppliedHash, expected)
        ? suppliedExternalId
        : null
    }
    return null
  }

  test("accepts a correctly signed external hash", async () => {
    const hash = await hmacSha256Hex(identitySecret, externalId)

    const result = await verifyIdentity({
      secret: identitySecret,
      suppliedExternalId: externalId,
      suppliedHash: hash,
    })

    expect(result).toBe(externalId)
  })

  test("treats a tampered hash as anonymous rather than erroring", async () => {
    const result = await verifyIdentity({
      secret: identitySecret,
      suppliedExternalId: externalId,
      suppliedHash: "not-the-real-hash",
    })

    expect(result).toBeNull()
  })

  test("ignores a supplied hash when no identity secret is configured", async () => {
    const hash = await hmacSha256Hex(identitySecret, externalId)

    const result = await verifyIdentity({
      secret: null,
      suppliedExternalId: externalId,
      suppliedHash: hash,
    })

    expect(result).toBeNull()
  })

  test("rotating the secret invalidates a previously valid hash", async () => {
    const oldHash = await hmacSha256Hex(identitySecret, externalId)

    const result = await verifyIdentity({
      secret: "identity-secret-rotated",
      suppliedExternalId: externalId,
      suppliedHash: oldHash,
    })

    expect(result).toBeNull()
  })
})

describe("webchat client config DTO", () => {
  test("strips server-only secrets from the client-facing config", () => {
    const fullRow = {
      id: "webchat-1",
      workspaceId: "workspace-1",
      name: "Support",
      brandColor: "#007bff",
      showLogo: true,
      hideMessageInput: false,
      welcomeFlowId: "flow-1",
      persistentMenus: [],
      // server-only fields that must never reach the browser
      identitySecret: "super-secret-hmac-key",
      auth: { token: "channel-auth-blob" },
      authorizedDomains: ["example.com"],
      customCss: "body{}",
      inboxId: "inbox-1",
    } as unknown as IntegrationWebchatModel

    const dto = toWebchatClientConfig(fullRow)

    expect(dto).not.toHaveProperty("identitySecret")
    expect(dto).not.toHaveProperty("auth")
    expect(dto).not.toHaveProperty("authorizedDomains")
    expect(Object.keys(dto).sort()).toEqual([
      "brandColor",
      "hideMessageInput",
      "id",
      "name",
      "persistentMenus",
      "showLogo",
      "welcomeFlowId",
      "workspaceId",
    ])
  })
})
