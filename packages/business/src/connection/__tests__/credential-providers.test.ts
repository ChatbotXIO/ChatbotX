import type * as KyModule from "ky"
import type { NormalizedOptions } from "ky"
import { HTTPError, NetworkError, TimeoutError } from "ky"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  claudeConnectionProvider,
  deepseekConnectionProvider,
  geminiConnectionProvider,
  openaiCompatibleConnectionProvider,
  openaiConnectionProvider,
  openrouterConnectionProvider,
} from "../credential-providers"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  isCloud: vi.fn(() => false),
  verifyAiProviderApiKey: vi.fn(async () => "valid"),
}))

vi.mock("ky", async (importOriginal) => {
  const actual = await importOriginal<typeof KyModule>()
  return {
    ...actual,
    default: { get: mocks.get },
  }
})

vi.mock("../../integration-ai-provider/verify", () => ({
  verifyAiProviderApiKey: mocks.verifyAiProviderApiKey,
}))

// Defaults to OSS (`isCloud() === false`), matching every pre-existing test
// below — only the C2 SSRF-guard suite opts into the cloud-only check via
// `mockReturnValueOnce`. Mocking this file-wide as always-cloud would send
// the other tests' fake hostnames (`provider.example.com`, `*.invalid`,
// …) through a real DNS-over-HTTPS lookup in `assertPublicUrl`.
vi.mock("../../keys", () => ({ isCloud: mocks.isCloud }))

// Narrowed once: `ConnectionProvider.fromCredentials` is optional in the
// general type, but `openaiCompatibleConnectionProvider` always defines it.
if (!openaiCompatibleConnectionProvider.fromCredentials) {
  throw new Error(
    "openaiCompatibleConnectionProvider.fromCredentials is not defined",
  )
}
const fromCredentials = openaiCompatibleConnectionProvider.fromCredentials

const fakeRequest = () => new Request("https://provider.example.com/models")
// `NormalizedOptions` has no public constructor and every field is
// internal to ky's request pipeline — these tests only read the error's
// `message`, never `options`, so an empty object stands in for it.
const fakeOptions = {} as unknown as NormalizedOptions

beforeEach(() => {
  vi.clearAllMocks()
})

describe("openaiCompatibleConnectionProvider.fromCredentials", () => {
  it("accepts a reachable endpoint that returns 2xx", async () => {
    mocks.get.mockResolvedValue(new Response(null, { status: 200 }))

    await expect(
      fromCredentials({
        apiKey: "sk-live",
        baseURL: "https://provider.example.com",
      }),
    ).resolves.toMatchObject({
      authType: "secretText",
      baseURL: "https://provider.example.com/",
      secretText: "sk-live",
    })
  })

  it("reports an invalid API key on 401", async () => {
    mocks.get.mockRejectedValue(
      new HTTPError(
        new Response(null, { status: 401 }),
        fakeRequest(),
        fakeOptions,
      ),
    )

    await expect(
      fromCredentials({
        apiKey: "sk-bad",
        baseURL: "https://provider.example.com",
      }),
    ).rejects.toThrow("Invalid API key")
  })

  it("rejects — not ok:true — a 404 (regression: a wrong baseURL path used to connect silently)", async () => {
    mocks.get.mockRejectedValue(
      new HTTPError(
        new Response(null, { status: 404 }),
        fakeRequest(),
        fakeOptions,
      ),
    )

    await expect(
      fromCredentials({
        apiKey: "sk-live",
        baseURL: "https://provider.example.com/wrong-path",
      }),
    ).rejects.toThrow("HTTP 404")
  })

  it("rejects — not ok:true — a DNS/network failure (regression: an unreachable host used to connect silently)", async () => {
    mocks.get.mockRejectedValue(new NetworkError(fakeRequest()))

    await expect(
      fromCredentials({
        apiKey: "sk-live",
        baseURL: "https://does-not-resolve.invalid",
      }),
    ).rejects.toThrow("Unable to reach the endpoint")
  })

  it("rejects — not ok:true — a timeout (regression: a hung/unresponsive provider used to connect silently)", async () => {
    mocks.get.mockRejectedValue(new TimeoutError(fakeRequest()))

    await expect(
      fromCredentials({
        apiKey: "sk-live",
        baseURL: "https://slow.example.com",
      }),
    ).rejects.toThrow("did not respond in time")
  })

  it("rejects redirects without following them to another host", async () => {
    mocks.get.mockRejectedValue(
      new HTTPError(
        new Response(null, { status: 302 }),
        fakeRequest(),
        fakeOptions,
      ),
    )

    await expect(
      fromCredentials({
        apiKey: "sk-live",
        baseURL: "https://provider.example.com",
      }),
    ).rejects.toThrow("Unexpected redirect")

    expect(mocks.get).toHaveBeenCalledWith(
      "https://provider.example.com/models",
      expect.objectContaining({ redirect: "manual" }),
    )
  })
})

describe.each([
  ["claude", claudeConnectionProvider],
  ["deepseek", deepseekConnectionProvider],
  ["gemini", geminiConnectionProvider],
  ["openai", openaiConnectionProvider],
  ["openrouter", openrouterConnectionProvider],
] as const)("AI API-key provider: %s", (providerName, provider) => {
  it("rejects a credential when verification is inconclusive", async () => {
    const fromCredentials = provider.fromCredentials
    if (!fromCredentials) {
      throw new Error(`${providerName} is missing fromCredentials`)
    }
    mocks.verifyAiProviderApiKey.mockResolvedValueOnce("unknown")

    await expect(
      fromCredentials({ apiKey: "possibly-valid-key" }),
    ).rejects.toThrow("Unable to verify")
  })

  it("marks invalid credentials revoked and unknown verification degraded", async () => {
    mocks.verifyAiProviderApiKey.mockResolvedValueOnce("invalid")
    await expect(
      provider.verify({ auth: { authType: "secretText", secretText: "bad" } }),
    ).resolves.toEqual({
      ok: false,
      revoked: true,
      error: "Invalid API key",
    })

    mocks.verifyAiProviderApiKey.mockResolvedValueOnce("unknown")
    await expect(
      provider.verify({
        auth: { authType: "secretText", secretText: "unknown" },
      }),
    ).resolves.toEqual({
      ok: false,
      revoked: false,
      error: "Unable to verify API key",
    })
  })
})

describe("openaiCompatibleConnectionProvider.verify", () => {
  it("verifies the stored endpoint and reports healthy", async () => {
    mocks.get.mockResolvedValue(new Response(null, { status: 200 }))

    await expect(
      openaiCompatibleConnectionProvider.verify({
        auth: {
          authType: "secretText",
          baseURL: "https://provider.example.com",
          secretText: "sk-live",
        },
      }),
    ).resolves.toEqual({ ok: true })

    expect(mocks.get).toHaveBeenCalledWith(
      "https://provider.example.com/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer sk-live" },
      }),
    )
  })

  it("reports an unauthorized stored API key as revoked", async () => {
    mocks.get.mockRejectedValue(
      new HTTPError(
        new Response(null, { status: 401 }),
        fakeRequest(),
        fakeOptions,
      ),
    )

    await expect(
      openaiCompatibleConnectionProvider.verify({
        auth: {
          authType: "secretText",
          baseURL: "https://provider.example.com",
          secretText: "sk-bad",
        },
      }),
    ).resolves.toEqual({
      ok: false,
      revoked: true,
      error: "Invalid API key",
    })
  })
})

describe("openaiCompatibleConnectionProvider.describe", () => {
  it("derives sourceId from auth.baseURL so two different endpoints are two different connections (regression: a constant sourceId would collide on the Connection table's (workspaceId, provider, sourceId) unique key, breaking the 'openaiCompatible permits multiple rows per workspace' contract)", () => {
    const first = openaiCompatibleConnectionProvider.describe({
      authType: "secretText",
      baseURL: "https://one.example.com",
      secretText: "sk-one",
    })
    const second = openaiCompatibleConnectionProvider.describe({
      authType: "secretText",
      baseURL: "https://two.example.com",
      secretText: "sk-two",
    })

    expect(first.sourceId).toBe("https://one.example.com")
    expect(second.sourceId).toBe("https://two.example.com")
    expect(first.sourceId).not.toBe(second.sourceId)
  })

  it("derives the same sourceId for the same baseURL, so reconnecting the same endpoint collides on purpose", () => {
    const auth = {
      authType: "secretText" as const,
      baseURL: "https://one.example.com",
      secretText: "sk-one",
    }

    expect(openaiCompatibleConnectionProvider.describe(auth).sourceId).toBe(
      openaiCompatibleConnectionProvider.describe(auth).sourceId,
    )
  })
})

describe("openaiCompatibleConnectionProvider.fromCredentials — SSRF guard (C2)", () => {
  it("rejects a link-local baseURL (e.g. the cloud metadata address) without ever probing it", async () => {
    mocks.isCloud.mockReturnValueOnce(true)

    await expect(
      fromCredentials({
        apiKey: "sk-live",
        baseURL: "http://169.254.169.254",
      }),
    ).rejects.toMatchObject({ code: "ssrfBlocked" })

    expect(mocks.get).not.toHaveBeenCalled()
  })
})
