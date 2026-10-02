import type { NormalizedOptions } from "ky"
import { HTTPError, NetworkError, TimeoutError } from "ky"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
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
