import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getAdVideoStatus, uploadAdVideo } from "../src/apis/advideos"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("uploadAdVideo", () => {
  test("returns the video_id immediately (processing happens async)", async () => {
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/act_9/advideos`, () =>
        HttpResponse.json({ id: "vid_1" }),
      ),
    )

    const result = await uploadAdVideo({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      fileName: "clip.mp4",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "video/mp4",
    })

    expect(result).toEqual({ videoId: "vid_1" })
  })
})

describe("getAdVideoStatus", () => {
  test("reports isReady: false while processing", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/vid_1`, () =>
        HttpResponse.json({
          id: "vid_1",
          status: { video_status: "processing" },
        }),
      ),
    )

    const status = await getAdVideoStatus({
      accessToken: ACCESS_TOKEN,
      videoId: "vid_1",
    })

    expect(status).toEqual({
      videoId: "vid_1",
      status: "processing",
      isReady: false,
      isError: false,
    })
  })

  test("reports isReady: true once Meta finishes processing", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/vid_1`, () =>
        HttpResponse.json({ id: "vid_1", status: { video_status: "ready" } }),
      ),
    )

    const status = await getAdVideoStatus({
      accessToken: ACCESS_TOKEN,
      videoId: "vid_1",
    })

    expect(status.isReady).toBe(true)
    expect(status.isError).toBe(false)
  })

  test("reports isError: true on a failed encode", async () => {
    server.use(
      http.get(`${BASE}/${DEFAULT_API_VERSION}/vid_1`, () =>
        HttpResponse.json({ id: "vid_1", status: { video_status: "error" } }),
      ),
    )

    const status = await getAdVideoStatus({
      accessToken: ACCESS_TOKEN,
      videoId: "vid_1",
    })

    expect(status.isError).toBe(true)
    expect(status.isReady).toBe(false)
  })
})
