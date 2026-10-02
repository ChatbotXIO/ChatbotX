import type { NormalizedOptions } from "ky"
import { HTTPError, NetworkError, TimeoutError } from "ky"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  isCloud: vi.fn(() => false),
}))

vi.mock("ky", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ky")>()
  return {
    ...actual,
    default: { get: mocks.get },
  }
})

vi.mock("../../integration-ai-provider/verify", () => ({
  verifyAiProviderApiKey: vi.fn(async () => true),
}))

// Defaults to OSS (`isCloud() === false`), matching every pre-existing test
// below — only the C2 SSRF-guard suite opts into the cloud-only check via
// `mockReturnValueOnce`. Mocking this file-wide as always-cloud would send
// the other tests' fake hostnames (`provider.example.com`, `*.invalid`,
// …) through a real DNS-over-HTTPS lookup in `assertPublicUrl`.
vi.mock("../../keys", () => ({ isCloud: mocks.isCloud }))

const { openaiCompatibleConnectionProvider } = await import(
  "../credential-providers"
)
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
    ).resolves.toMatchObject({ authType: "secretText", secretText: "sk-live" })
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
