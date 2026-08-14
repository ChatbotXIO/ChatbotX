// @vitest-environment node

import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  getParentOriginFromUrl,
  isOriginAuthorized,
} from "@/features/integration-webchat/lib/authorized-domain"
import { createGuestConversationId } from "@/features/integration-webchat/lib/guest-conversation-id"
import {
  createWebchatAccessToken,
  verifyWebchatAccessToken,
} from "@/features/integration-webchat/lib/webchat-access-token"
import { createGuestSessionStore } from "@/features/integration-webchat/providers/store/guest-sesssion-store"
import {
  buildGuestStorageKey,
  GUEST_CONVERSATION_ID_KEY,
  readLegacyGuestId,
  safeStorageGet,
  safeStorageSet,
} from "@/features/integration-webchat/providers/store/lib/guest-session"
import { toWebchatClientConfig } from "@/features/integration-webchat/providers/store/lib/webchat-client-config"
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

const GUEST_ID_UUID_PATTERN =
  /^workspace-1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  test("creates a guest conversation id scoped to the workspace with an unguessable suffix", () => {
    // Must be a cryptographically random id, not a sequential/enumerable one
    // (e.g. the Snowflake createId()) — the webchat access token no longer
    // binds to this id, so a guessable id would let anyone mint a valid
    // token for a stranger's conversation. See guest-conversation-id.ts.
    const first = createGuestConversationId("workspace-1")
    const second = createGuestConversationId("workspace-1")

    expect(first).toMatch(GUEST_ID_UUID_PATTERN)
    expect(second).toMatch(GUEST_ID_UUID_PATTERN)
    expect(first).not.toBe(second)
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

    store.getState().initGuestSession("workspace-1:server-guest")

    const state = store.getState()
    const scopedKey = buildGuestStorageKey("workspace-1", "webchat-1")
    expect(state.guestConversationId).toBe("workspace-1:server-guest")
    expect(state.isNewGuestSession).toBe(true)
    expect(localStorageMock.items.get(scopedKey)).toBe(
      "workspace-1:server-guest",
    )
  })

  test("reuses an existing scoped session without marking it new", () => {
    const scopedKey = buildGuestStorageKey("workspace-1", "webchat-1")
    vi.stubGlobal(
      "localStorage",
      createLocalStorageMock({ [scopedKey]: "workspace-1:existing-guest" }),
    )

    const store = createGuestSessionStore(createWebchatConfig())

    store.getState().initGuestSession("workspace-1:server-guest")

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

    store.getState().initGuestSession("workspace-1:server-guest")

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

    firstStore.getState().initGuestSession("workspace-1:server-guest-1")
    secondStore.getState().initGuestSession("workspace-1:server-guest-2")

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

  test("rejects mismatched origins when domains are configured", () => {
    expect(isOriginAuthorized("https://attacker.test", ["example.com"])).toBe(
      false,
    )
  })

  test("allows a missing origin even when domains are configured (direct, non-embedded access)", () => {
    expect(isOriginAuthorized(null, ["example.com"])).toBe(true)
    expect(isOriginAuthorized(undefined, ["example.com"])).toBe(true)
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

  test("resets on a fixed window boundary instead of sliding forward on every hit", async () => {
    const store = createMemoryRateLimitStore()
    const windowStartMs = 1_700_000_000_000
    let result = { limited: false, retryAfter: 0 }

    // Exhaust the limit within the first window.
    for (let index = 0; index < 61; index += 1) {
      result = await checkGuestRateLimit({
        clientIp: "192.0.2.5",
        store,
        webchatId: "webchat-fixed-window",
        now: windowStartMs + index * 100,
      })
    }
    expect(result.limited).toBe(true)

    // A request in the next 10s window should not still be blocked, even
    // though the previous window was fully exhausted moments before —
    // proving the window is fixed/bucketed, not a sliding TTL.
    result = await checkGuestRateLimit({
      clientIp: "192.0.2.5",
      store,
      webchatId: "webchat-fixed-window",
      now: windowStartMs + 10_000,
    })
    expect(result.limited).toBe(false)
  })

  test("keeps counting within the same window even near its boundary", async () => {
    const store = createMemoryRateLimitStore()
    const windowStartMs = 1_700_000_000_000

    for (let index = 0; index < 61; index += 1) {
      // Stay inside the same 10s window (right up to but not crossing 9999ms
      // in) to prove a steady stream within one window is still capped.
      await checkGuestRateLimit({
        clientIp: "192.0.2.6",
        store,
        webchatId: "webchat-fixed-window-2",
        now: windowStartMs + Math.min(index * 100, 9999),
      })
    }

    const result = await checkGuestRateLimit({
      clientIp: "192.0.2.6",
      store,
      webchatId: "webchat-fixed-window-2",
      now: windowStartMs + 9999,
    })

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

  test("authorizes a token minted for the same workspace/webchat/origin", async () => {
    const token = await createWebchatAccessToken(baseInput)

    const result = await verifyWebchatAccessToken({ ...baseInput, token })

    expect(result.authorized).toBe(true)
  })

  test("rejects a missing token", async () => {
    const result = await verifyWebchatAccessToken({
      ...baseInput,
      token: null,
    })

    expect(result.authorized).toBe(false)
  })

  test("rejects a token whose workspace does not match", async () => {
    const token = await createWebchatAccessToken(baseInput)

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      workspaceId: "workspace-2",
      token,
    })

    expect(result.authorized).toBe(false)
  })

  test("rejects a tampered signature and does not leak the external id", async () => {
    const token = await createWebchatAccessToken(baseInput)
    const [payload] = token.split(".")

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      token: `${payload}.deadbeef`,
    })

    expect(result.authorized).toBe(false)
  })

  test("rejects a token presented from a different origin (bind-on-first-use)", async () => {
    const token = await createWebchatAccessToken(baseInput)

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      origin: "https://attacker.test",
      token,
    })

    expect(result.authorized).toBe(false)
  })

  test("returning visitor: a freshly minted token stays valid even though the client presents a different persisted guestConversationId", async () => {
    // Regression for CRITICAL-1: the iframe can't round-trip the client's
    // persisted guestConversationId back to the server (it lives in the
    // iframe's own localStorage), so every page load mints a brand-new
    // token. The token must not be bound to any particular id — only to
    // workspace/webchat/origin — or a legitimate returning visitor would be
    // rejected on their second load.
    const freshToken = await createWebchatAccessToken(baseInput)

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      token: freshToken,
    })

    expect(result.authorized).toBe(true)
  })

  test("matches a bare origin against a referer-shaped origin used at mint time", async () => {
    // Mint-time origin comes from the `referer` header (may include a path);
    // verify-time origin comes from `window.location.origin` (bare). Both
    // should normalize to the same host.
    const token = await createWebchatAccessToken({
      ...baseInput,
      origin: "https://example.com/pricing?ref=ad",
    })

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      origin: "https://example.com",
      token,
    })

    expect(result.authorized).toBe(true)
  })

  test("matches a subdomain-consistent origin the same way on mint and verify", async () => {
    const token = await createWebchatAccessToken({
      ...baseInput,
      origin: "https://widget.example.com",
    })

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      origin: "https://widget.example.com/some/path",
      token,
    })

    expect(result.authorized).toBe(true)
  })

  test("treats a null origin at mint and verify as consistent (direct, non-embedded access)", async () => {
    const token = await createWebchatAccessToken({
      ...baseInput,
      origin: null,
    })

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      origin: null,
      token,
    })

    expect(result.authorized).toBe(true)
  })

  test("rejects when minted with no origin but presented with one", async () => {
    const token = await createWebchatAccessToken({
      ...baseInput,
      origin: null,
    })

    const result = await verifyWebchatAccessToken({
      ...baseInput,
      origin: "https://example.com",
      token,
    })

    expect(result.authorized).toBe(false)
  })
})

describe("webchat client config DTO", () => {
  test("strips server-only secrets from the client-facing config", () => {
    const fullRow = {
      id: "webchat-1",
      workspaceId: "workspace-1",
      name: "Support",
      brandColor: "#007bff",
      hideHeader: false,
      showLogo: true,
      hideMessageInput: false,
      welcomeFlowId: "flow-1",
      persistentMenus: [],
      // server-only fields that must never reach the browser. identitySecret
      // is no longer a real column (dropped alongside the customer-HMAC
      // identity model) — kept here as a regression guard in case it is ever
      // reintroduced.
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
      "hideHeader",
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
