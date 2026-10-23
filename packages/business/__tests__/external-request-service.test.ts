import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkSsrfSafety: vi.fn(async () => ({
    unsafe: false,
    resolvedIps: ["93.184.216.34"],
  })),
  findByIdOrFail: vi.fn(async () => ({ id: "contact-1", firstName: "Ada" })),
  listValues: vi.fn(async () => [{ customFieldId: "field-1", value: "x" }]),
  setValues: vi.fn(async () => undefined),
}))

vi.mock("../src/net/ssrf-guard", () => ({
  checkSsrfSafety: mocks.checkSsrfSafety,
}))

vi.mock("../src/contact/service", () => ({
  contactService: { findByIdOrFail: mocks.findByIdOrFail },
}))

vi.mock("../src/contact-custom-field/service", () => ({
  contactCustomFieldService: {
    listValues: mocks.listValues,
    setValues: mocks.setValues,
  },
}))

const { externalRequestService } = await import(
  "../src/external-request/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.checkSsrfSafety.mockResolvedValue({
    unsafe: false,
    resolvedIps: ["93.184.216.34"],
  })
  mocks.findByIdOrFail.mockResolvedValue({ id: "contact-1", firstName: "Ada" })
  mocks.listValues.mockResolvedValue([{ customFieldId: "field-1", value: "x" }])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("externalRequestService.execute", () => {
  test("throws when the URL is SSRF-unsafe, without calling fetch", async () => {
    mocks.checkSsrfSafety.mockResolvedValue({ unsafe: true })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      externalRequestService.execute(
        { method: "GET", url: "http://169.254.169.254/", headers: [] },
        { workspaceId: "workspace-1" },
      ),
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("follows a redirect to a safe target and returns its response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.redirect("https://api.example.com/final", 302),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await externalRequestService.execute(
      { method: "GET", url: "https://api.example.com/data", headers: [] },
      { workspaceId: "workspace-1" },
    )

    expect(result.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.example.com/final")
  })

  test("cancels a redirect response body before following it", async () => {
    const redirectResponse = new Response("ignored", {
      status: 302,
      headers: { location: "https://api.example.com/final" },
    })
    const cancel = vi.spyOn(redirectResponse.body as ReadableStream, "cancel")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse)
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await externalRequestService.execute(
      { method: "GET", url: "https://api.example.com/data", headers: [] },
      { workspaceId: "workspace-1" },
    )

    expect(cancel).toHaveBeenCalledOnce()
  })
  test("switches a POST 302 redirect to GET without body headers or mutating the prior request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.redirect("https://api.example.com/final", 302),
      )
      .mockResolvedValueOnce(new Response("OK", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await externalRequestService.execute(
      {
        method: "POST",
        url: "https://api.example.com/data",
        headers: [
          { key: "Authorization", value: "Bearer secret" },
          { key: "Content-Language", value: "en" },
          { key: "X-Request-Id", value: "request-1" },
        ],
        body: { bodyType: "json", jsonBody: '{"name":"Ada"}' },
      },
      { workspaceId: "workspace-1" },
    )

    const [, initialInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const [, redirectedInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const initialHeaders = new Headers(initialInit.headers)
    const redirectedHeaders = new Headers(redirectedInit.headers)

    expect(result).toMatchObject({ statusCode: 200, responseBody: "OK" })
    expect(redirectedInit).not.toBe(initialInit)
    expect(redirectedInit.method).toBe("GET")
    expect(redirectedInit.body).toBeUndefined()
    expect(redirectedHeaders.get("authorization")).toBe("Bearer secret")
    expect(redirectedHeaders.get("content-type")).toBeNull()
    expect(redirectedHeaders.get("content-language")).toBeNull()
    expect(redirectedHeaders.get("content-length")).toBeNull()
    expect(redirectedHeaders.get("content-encoding")).toBeNull()
    expect(redirectedHeaders.get("content-location")).toBeNull()
    expect(redirectedHeaders.get("x-request-id")).toBe("request-1")
    expect(initialInit.body).toBe('{"name":"Ada"}')
    expect(initialHeaders.get("content-type")).toBe("application/json")
    expect(initialHeaders.get("content-language")).toBe("en")
  })

  test.each([
    [301, "POST", "GET"],
    [303, "PUT", "GET"],
    [303, "GET", "GET"],
  ] as const)("uses %s redirect semantics for %s requests", async (status, method, expectedMethod) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.redirect("https://api.example.com/final", status),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await externalRequestService.execute(
      {
        method,
        url: "https://api.example.com/data",
        headers: [],
        body:
          method === "GET"
            ? undefined
            : { bodyType: "json", jsonBody: '{"name":"Ada"}' },
      },
      { workspaceId: "workspace-1" },
    )

    const [, redirectedInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(redirectedInit.method).toBe(expectedMethod)
    expect(redirectedInit.body).toBeUndefined()
  })

  test.each([
    307, 308,
  ] as const)("preserves POST method and body across a %s redirect", async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.redirect("https://api.example.com/final", status),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await externalRequestService.execute(
      {
        method: "POST",
        url: "https://api.example.com/data",
        headers: [],
        body: { bodyType: "json", jsonBody: '{"name":"Ada"}' },
      },
      { workspaceId: "workspace-1" },
    )

    const [, redirectedInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(redirectedInit.method).toBe("POST")
    expect(redirectedInit.body).toBe('{"name":"Ada"}')
  })

  test("drops authorization only on cross-origin redirects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.redirect("https://redirect.example.net/final", 302),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(
        Response.redirect("https://api.example.com/final", 302),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const input = {
      method: "GET" as const,
      url: "https://api.example.com/data",
      headers: [{ key: "Authorization", value: "Bearer secret" }],
    }

    await externalRequestService.execute(input, { workspaceId: "workspace-1" })
    await externalRequestService.execute(input, { workspaceId: "workspace-1" })

    const [, crossOriginInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const [, sameOriginInit] = fetchMock.mock.calls[3] as [string, RequestInit]
    expect(new Headers(crossOriginInit.headers).get("authorization")).toBeNull()
    expect(new Headers(sameOriginInit.headers).get("authorization")).toBe(
      "Bearer secret",
    )
  })

  test("blocks a redirect whose target is SSRF-unsafe", async () => {
    mocks.checkSsrfSafety
      .mockResolvedValueOnce({ unsafe: false, resolvedIps: ["93.184.216.34"] })
      .mockResolvedValueOnce({ unsafe: true })
    const fetchMock = vi.fn(async () =>
      Response.redirect("http://169.254.169.254/", 302),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      externalRequestService.execute(
        { method: "GET", url: "https://api.example.com/data", headers: [] },
        { workspaceId: "workspace-1" },
      ),
    ).rejects.toThrow("This URL is not allowed for external requests")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("stops following redirects once the limit is exceeded", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      Response.redirect(`${url}/next`, 302),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      externalRequestService.execute(
        { method: "GET", url: "https://api.example.com/data", headers: [] },
        { workspaceId: "workspace-1" },
      ),
    ).rejects.toThrow("Too many redirects")
  })

  test("GET builds a request with no body", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await externalRequestService.execute(
      { method: "GET", url: "https://api.example.com/data", headers: [] },
      { workspaceId: "workspace-1" },
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.example.com/data")
    expect(init.method).toBe("GET")
    expect(init.body).toBeUndefined()
    expect(init.redirect).toBe("manual")
  })

  test("POST with json body sets Content-Type: application/json", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await externalRequestService.execute(
      {
        method: "POST",
        url: "https://api.example.com/data",
        headers: [],
        body: { bodyType: "json", jsonBody: '{"a":1}' },
      },
      { workspaceId: "workspace-1" },
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe('{"a":1}')
    expect((init.headers as Headers).get("Content-Type")).toBe(
      "application/json",
    )
  })

  test("POST with formEncoded body URL-encodes fields", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await externalRequestService.execute(
      {
        method: "POST",
        url: "https://api.example.com/data",
        headers: [],
        body: {
          bodyType: "formEncoded",
          formFields: [{ key: "name", value: "Ada Lovelace" }],
        },
      },
      { workspaceId: "workspace-1" },
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe("name=Ada+Lovelace")
    expect((init.headers as Headers).get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    )
  })

  test("allContactData body requires a contactId", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      externalRequestService.execute(
        {
          method: "POST",
          url: "https://api.example.com/data",
          headers: [],
          body: { bodyType: "allContactData" },
        },
        { workspaceId: "workspace-1" },
      ),
    ).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("allContactData body includes contact and custom fields when a contactId is present", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await externalRequestService.execute(
      {
        method: "POST",
        url: "https://api.example.com/data",
        headers: [],
        body: { bodyType: "allContactData" },
      },
      { workspaceId: "workspace-1", contactId: "contact-1" },
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      contact: { id: "contact-1", firstName: "Ada" },
      customFields: [{ customFieldId: "field-1", value: "x" }],
    })
  })
})

describe("externalRequestService.executeAndMap", () => {
  test("returns without writing fields on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    )

    const result = await externalRequestService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      input: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [],
      },
      mapping: [{ jsonPath: "id", outputFieldId: "field-1" }],
    })

    expect(result.statusCode).toBe(500)
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("maps JSON response fields and writes them via contactCustomFieldService", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ user: { id: "abc-123" } }), {
            status: 200,
          }),
      ),
    )

    await externalRequestService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      input: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [],
      },
      mapping: [{ jsonPath: "user.id", outputFieldId: "field-1" }],
    })

    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "field-1", value: "abc-123" }],
    })
  })

  test("returns the raw result untouched when the response is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    )

    const result = await externalRequestService.executeAndMap({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      input: {
        method: "GET",
        url: "https://api.example.com/data",
        headers: [],
      },
      mapping: [{ jsonPath: "id", outputFieldId: "field-1" }],
    })

    expect(result.responseBody).toBe("not json")
    expect(mocks.setValues).not.toHaveBeenCalled()
  })
})
