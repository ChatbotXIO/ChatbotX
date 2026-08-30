import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { createAdCreative } from "../src/apis/adcreatives"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("createAdCreative", () => {
  // Creative metadata is sent as JSON; capture the native object story spec.
  const captureObjectStorySpec = () => {
    const captured: {
      spec?: Record<string, unknown>
    } = {}
    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/adcreatives`,
        async ({ request }) => {
          const body = (await request.json()) as {
            object_story_spec?: Record<string, unknown>
          }
          captured.spec = body.object_story_spec
          return HttpResponse.json({ id: "creative_1" })
        },
      ),
    )
    return captured
  }

  test("assembles object_story_spec for an image creative with CTID instagram_actor_id", async () => {
    const captured = captureObjectStorySpec()

    const result = await createAdCreative({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      name: "Creative [cbx:op_1]",
      pageId: "pg_1",
      instagramActorId: "ig_1",
      media: {
        kind: "image",
        linkData: { link: "https://example.com", image_hash: "hash_1" },
      },
      pageWelcomeMessage: { type: "single", message: "Hi!" },
      callToAction: {
        type: "INSTAGRAM_MESSAGE",
        value: { app_destination: "INSTAGRAM_DIRECT" },
      },
    })

    expect(result.id).toBe("creative_1")
    expect(captured.spec?.instagram_actor_id).toBe("ig_1")
    // BOTH call_to_action AND page_welcome_message must be nested INSIDE
    // link_data, never at object_story_spec top level (per Meta docs examples).
    const linkData = captured.spec?.link_data as Record<string, unknown>
    expect(linkData).toMatchObject({
      link: "https://example.com",
      image_hash: "hash_1",
      call_to_action: {
        type: "INSTAGRAM_MESSAGE",
        value: { app_destination: "INSTAGRAM_DIRECT" },
      },
    })
    expect(typeof linkData.page_welcome_message).toBe("string")
    // Neither belongs at the object_story_spec top level.
    expect(captured.spec?.call_to_action).toBeUndefined()
    expect(captured.spec?.page_welcome_message).toBeUndefined()
  })

  test("assembles object_story_spec for a video creative", async () => {
    const captured = captureObjectStorySpec()

    await createAdCreative({
      accessToken: ACCESS_TOKEN,
      adAccountId: "act_9",
      name: "Creative [cbx:op_2]",
      pageId: "pg_1",
      media: {
        kind: "video",
        videoData: { video_id: "vid_1", image_hash: "thumb_hash" },
      },
      pageWelcomeMessage: { type: "default" },
      callToAction: {
        type: "MESSAGE_PAGE",
        value: { app_destination: "MESSENGER" },
      },
    })

    expect(captured.spec?.video_data).toEqual({
      video_id: "vid_1",
      image_hash: "thumb_hash",
      call_to_action: {
        type: "MESSAGE_PAGE",
        value: { app_destination: "MESSENGER" },
      },
    })
    expect(captured.spec?.call_to_action).toBeUndefined()
  })
})
