// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findUnscoped,
  create,
  verifyMiniAppToken,
  loadServableWorkspace,
  checkGuestRateLimit,
} = vi.hoisted(() => ({
  findUnscoped: vi.fn(),
  create: vi.fn(),
  verifyMiniAppToken: vi.fn(),
  loadServableWorkspace: vi.fn(),
  checkGuestRateLimit: vi.fn(),
}))

vi.mock("@chatbotx.io/business/mini-app", () => {
  class MiniAppUploadError extends Error {
    reason: string
    httpStatusCode: number
    constructor(reason: string) {
      super(reason)
      this.reason = reason
      this.httpStatusCode = reason === "too_large" ? 413 : 422
    }
  }
  return {
    MiniAppUploadError,
    miniAppService: { findUnscoped },
    miniAppUploadService: { create },
  }
})
vi.mock("@chatbotx.io/encryption/mini-app-token", () => ({
  verifyMiniAppToken,
}))
vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace,
}))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  checkGuestRateLimit,
  resolveGuestRateLimitKey: (_headers: Headers, fallback: string) => fallback,
}))
vi.mock("@/lib/log", () => ({ logger: { error: vi.fn() } }))

const { POST } = await import("../src/app/api/mini-apps/[id]/uploads/route")
const { MiniAppUploadError } = await import("@chatbotx.io/business/mini-app")

const send = (id: string, form: FormData, site = "same-origin") =>
  POST(
    new Request(`https://app.example.com/api/mini-apps/${id}/uploads`, {
      method: "POST",
      body: form,
      headers: { "sec-fetch-site": site, "content-length": "1024" },
    }) as never,
    { params: Promise.resolve({ id }) },
  )

const form = (fields: Record<string, string | Blob>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    data.append(key, value)
  }
  return data
}
const photo = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", {
    type: "image/jpeg",
  })

beforeEach(() => {
  vi.clearAllMocks()
  checkGuestRateLimit.mockResolvedValue({ limited: false })
  loadServableWorkspace.mockResolvedValue({ servable: true })
  findUnscoped.mockResolvedValue({
    id: "9",
    workspaceId: "1",
    enabled: true,
    definition: { screens: [] },
  })
  create.mockResolvedValue({
    uploadId: "u",
    name: "a.jpg",
    size: 3,
    mimeType: "image/jpeg",
    url: "https://cdn/x",
  })
})

describe("POST /api/mini-apps/[id]/uploads", () => {
  test("stores the file for the contact in a valid token", async () => {
    verifyMiniAppToken.mockResolvedValue({ workspaceId: "1", contactId: "7" })
    const response = await send(
      "9",
      form({ file: photo(), inputName: "photo", token: "tok" }),
    )
    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "7", inputName: "photo" }),
    )
  })

  test("ignores a token signed for another workspace", async () => {
    verifyMiniAppToken.mockResolvedValue({ workspaceId: "2", contactId: "7" })
    await send("9", form({ file: photo(), inputName: "photo", token: "tok" }))
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: null }),
    )
  })

  test("rejects cross-site posts, unknown or disabled Mini Apps and rate-limited visitors", async () => {
    expect(
      (
        await send(
          "9",
          form({ file: photo(), inputName: "photo" }),
          "cross-site",
        )
      ).status,
    ).toBe(403)
    expect(
      (await send("abc", form({ file: photo(), inputName: "photo" }))).status,
    ).toBe(404)
    findUnscoped.mockResolvedValueOnce({
      id: "9",
      workspaceId: "1",
      enabled: false,
    })
    expect(
      (await send("9", form({ file: photo(), inputName: "photo" }))).status,
    ).toBe(404)
    checkGuestRateLimit.mockResolvedValueOnce({ limited: true })
    expect(
      (await send("9", form({ file: photo(), inputName: "photo" }))).status,
    ).toBe(429)
    expect(create).not.toHaveBeenCalled()
  })

  test("answers a rejected file with its reason", async () => {
    create.mockRejectedValueOnce(new MiniAppUploadError("type_not_allowed"))
    const response = await send(
      "9",
      form({ file: photo(), inputName: "photo" }),
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: "type_not_allowed" })
  })

  test("refuses a body without a known, bounded size", async () => {
    const request = (length: string | null) => {
      const headers = new Headers({ "sec-fetch-site": "same-origin" })
      if (length !== null) {
        headers.set("content-length", length)
      }
      return POST({ headers, formData: vi.fn() } as never, {
        params: Promise.resolve({ id: "9" }),
      })
    }
    expect((await request(null)).status).toBe(411)
    expect((await request(String(30 * 1024 * 1024))).status).toBe(413)
    expect(create).not.toHaveBeenCalled()
  })

  test("requires a file and an input name", async () => {
    expect((await send("9", form({ inputName: "photo" }))).status).toBe(400)
  })
})
