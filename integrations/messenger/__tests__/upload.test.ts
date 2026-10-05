import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { beforeEach, describe, expect, test } from "vitest"
import { resumableUploadImage } from "../src/apis/upload"

const AUTH = {
  clientId: "app-123",
  tokens: { accessToken: "page-token" },
  metadata: {
    pageId: "page-123",
    version: "v23.0",
  },
} as never

function imageResponse() {
  return new HttpResponse(new Uint8Array([1, 2, 3]), {
    headers: { "content-type": "image/png" },
    status: 200,
  })
}

describe("resumableUploadImage", () => {
  let imageRequestHeaders: Headers | undefined

  beforeEach(() => {
    imageRequestHeaders = undefined
    server.use(
      http.get("https://graph.facebook.com/header.png", ({ request }) => {
        imageRequestHeaders = request.headers
        return imageResponse()
      }),
      http.get("https://storage.test/header.png", ({ request }) => {
        imageRequestHeaders = request.headers
        return imageResponse()
      }),
      http.post("https://graph.facebook.com/:version/:appId/uploads", () =>
        HttpResponse.json({ id: "upload-session" }),
      ),
      http.post("https://graph.facebook.com/:version/upload-session", () =>
        HttpResponse.json({ h: "header-handle" }),
      ),
    )
  })

  test("downloads template handles with bearer auth by default", async () => {
    await resumableUploadImage(AUTH, "https://graph.facebook.com/header.png")

    expect(imageRequestHeaders?.get("authorization")).toBe("Bearer page-token")
  })

  test("downloads public create-template images without bearer auth", async () => {
    await resumableUploadImage(AUTH, "https://storage.test/header.png", {
      authenticatedDownload: false,
    })

    expect(imageRequestHeaders?.get("authorization")).toBeNull()
  })

  test("does not follow a redirect for an unauthenticated download", async () => {
    server.use(
      http.get(
        "https://storage.test/redirect.png",
        () =>
          new HttpResponse(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data" },
          }),
      ),
    )

    await expect(
      resumableUploadImage(AUTH, "https://storage.test/redirect.png", {
        authenticatedDownload: false,
      }),
    ).rejects.toThrow()
  })

  test("rejects an image larger than the limit", async () => {
    server.use(
      http.get(
        "https://storage.test/big.png",
        () =>
          new HttpResponse(new Uint8Array(6 * 1024 * 1024), {
            headers: { "content-type": "image/png" },
          }),
      ),
    )

    await expect(
      resumableUploadImage(AUTH, "https://storage.test/big.png", {
        authenticatedDownload: false,
      }),
    ).rejects.toThrow("larger than")
  })
})
