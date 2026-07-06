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
