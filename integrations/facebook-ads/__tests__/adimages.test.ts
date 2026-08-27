import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { uploadAdImage } from "../src/apis/adimages"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("uploadAdImage", () => {
  test("reads the hash keyed by the uploaded filename, not a flat field", async () => {
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/act_9/adimages`, () =>
        HttpResponse.json({
          images: { "photo.jpg": { hash: "abc123hash" } },
        }),
      ),
    )

    const result = await uploadAdImage({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      fileName: "photo.jpg",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
    })

    expect(result).toEqual({ imageHash: "abc123hash" })
  })

  test("throws when the response has no entry for the uploaded filename", async () => {
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/act_9/adimages`, () =>
        HttpResponse.json({
          images: { "different-name.jpg": { hash: "abc123hash" } },
        }),
      ),
    )

    await expect(
      uploadAdImage({
        accessToken: ACCESS_TOKEN,
        adAccountId: "act_9",
        fileName: "photo.jpg",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow()
  })
})
