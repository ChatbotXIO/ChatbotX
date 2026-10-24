import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkSsrfSafety: vi.fn(),
  isCloud: vi.fn(),
}))

vi.mock("../src/keys", () => ({ isCloud: mocks.isCloud }))
vi.mock("../src/net", () => ({ checkSsrfSafety: mocks.checkSsrfSafety }))

const { assertSafeMcpEndpoint } = await import(
  "../src/ai-mcp-server/endpoint-policy"
)

const rejected = { code: "invalidMcpServerEndpoint", httpStatusCode: 400 }

describe("MCP endpoint policy on cloud", () => {
  beforeEach(() => {
    mocks.isCloud.mockReset()
    mocks.isCloud.mockReturnValue(true)
    mocks.checkSsrfSafety.mockReset()
    mocks.checkSsrfSafety.mockResolvedValue({
      unsafe: false,
      resolvedIps: ["93.184.216.34"],
    })
  })

  test("accepts an endpoint the shared SSRF guard considers public", async () => {
    await expect(
      assertSafeMcpEndpoint("https://mcp.example.com/mcp"),
    ).resolves.toBeUndefined()
    expect(mocks.checkSsrfSafety).toHaveBeenCalledWith(
      "https://mcp.example.com/mcp",
    )
  })

  test("rejects endpoints the shared SSRF guard marks unsafe", async () => {
    mocks.checkSsrfSafety.mockResolvedValue({ unsafe: true })

    await expect(
      assertSafeMcpEndpoint("https://internal.example.com/mcp"),
    ).rejects.toMatchObject(rejected)
  })

  test("rejects an unparseable URL without consulting the guard", async () => {
    await expect(assertSafeMcpEndpoint("not a url")).rejects.toMatchObject(
      rejected,
    )
    expect(mocks.checkSsrfSafety).not.toHaveBeenCalled()
  })

  test.each([
    "http://metadata.google.internal/mcp",
    "https://metadata.google.internal./mcp",
    "https://api.localhost/mcp",
  ])("rejects reserved hostname %s before resolving it", async (url) => {
    await expect(assertSafeMcpEndpoint(url)).rejects.toMatchObject(rejected)
    expect(mocks.checkSsrfSafety).not.toHaveBeenCalled()
  })

  test("requires https", async () => {
    await expect(
      assertSafeMcpEndpoint("http://mcp.example.com/mcp"),
    ).rejects.toMatchObject(rejected)
    expect(mocks.checkSsrfSafety).not.toHaveBeenCalled()
  })
})

describe("MCP endpoint policy on self-hosted editions", () => {
  beforeEach(() => {
    mocks.isCloud.mockReset()
    mocks.isCloud.mockReturnValue(false)
    mocks.checkSsrfSafety.mockReset()
  })

  test.each([
    "http://mcp-tools:8080/mcp",
    "http://10.0.0.5/mcp",
    "https://mcp.internal.example/mcp",
  ])("accepts %s without consulting the SSRF guard", async (url) => {
    await expect(assertSafeMcpEndpoint(url)).resolves.toBeUndefined()
    expect(mocks.checkSsrfSafety).not.toHaveBeenCalled()
  })

  test.each([
    "ftp://mcp.example.com/mcp",
    "not a url",
  ])("rejects %s", async (url) => {
    await expect(assertSafeMcpEndpoint(url)).rejects.toMatchObject(rejected)
    expect(mocks.checkSsrfSafety).not.toHaveBeenCalled()
  })
})
