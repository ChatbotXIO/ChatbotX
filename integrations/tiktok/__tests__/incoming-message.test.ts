import type { Context } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"
import { logger } from "../src/lib/logger"
import type { TiktokAuthValue } from "../src/schema"

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

beforeEach(() => {
  vi.mocked(logger.warn).mockClear()
})

const BUSINESS_OPEN_ID = "-000m4JH_b1JiHPxoOSKii9FmQCeIA2fZ7Jw"
const CUSTOMER_UNIQUE_ID =
  "+ZMM6I2kBFMYfuEhZjEEt6o0FEebXi68VHcHvO0WgQlZMkbqHafwNm7D4qoyqm52"
const SHARED_VIDEO_ID = "7685373940801228040"
const SHARED_EMBED_URL = `https://www.tiktok.com/player/v1/${SHARED_VIDEO_ID}?music_info=1&description=1&autoplay=1&loop=1&utm_campaign=tt4d_open_api&utm_source=dm`

const ctx = {} as Context<TiktokAuthValue>

const run = (event: string, content: Record<string, unknown>) =>
  receiveMessage({
    ctx,
    data: {
      integrationType: "tiktok",
      integrationIdentifier: BUSINESS_OPEN_ID,
      payload: {
        client_key: "7623241219121414161",
        event,
        create_time: 1_789_814_497,
        user_openid: BUSINESS_OPEN_ID,
        content: JSON.stringify(content),
      },
    },
  })

/** The inbound half of a DM, shaped like the production webhook. */
const inboundContent = (overrides: Record<string, unknown> = {}) => ({
  timestamp: 1_789_814_497_488,
  unique_identifier: CUSTOMER_UNIQUE_ID,
  from_user: { id: CUSTOMER_UNIQUE_ID, role: "personal_account" },
  to_user: { id: BUSINESS_OPEN_ID, role: "business_account" },
  from: "wthzu_nb",
  to: "hunghero32",
  conversation_id: "u5JhpselBAhoPOlnH0tZ9y07kg==",
  message_id: "u5Buqc6lAghuOelnHUZV88DK2A==",
  type: "text",
  text: { body: "hello" },
  ...overrides,
})

describe("receiveMessage — shared posts", () => {
  // A share_post used to match neither the text branch nor the image branch,
  // so it produced a message row with no text and no attachment that still
  // fired `message:received` for every flow listening.
  test("renders a shared video as its link instead of an empty message", async () => {
    const result = await run(
      "im_receive_msg",
      inboundContent({
        type: "share_post",
        text: undefined,
        share_post: {
          video_id: SHARED_VIDEO_ID,
          embed_url: SHARED_EMBED_URL,
        },
      }),
    )

    expect(result.message.text).toBe(SHARED_EMBED_URL)
    expect(result.message.attachments).toEqual([])
    expect(result.message.contentAttributes).toEqual({
      type: "shared_post",
      sharedPost: { postId: SHARED_VIDEO_ID, url: SHARED_EMBED_URL },
    })
  })

  test("falls back to the video id when TikTok sends no embed url", async () => {
    const result = await run(
      "im_receive_msg",
      inboundContent({
        type: "share_post",
        text: undefined,
        share_post: { video_id: SHARED_VIDEO_ID },
      }),
    )

    expect(result.message.text).toBe(SHARED_VIDEO_ID)
    expect(result.message.contentAttributes).toEqual({
      type: "shared_post",
      sharedPost: { postId: SHARED_VIDEO_ID, url: undefined },
    })
  })

  // `share_post` carries `.catch(undefined)`: a shape TikTok changes under us
  // must cost the link preview, never the customer's message.
  test("keeps delivering the message when share_post has an unexpected shape", async () => {
    const result = await run(
      "im_receive_msg",
      inboundContent({
        type: "share_post",
        text: undefined,
        share_post: { video_id: 7_685_373_940_801_228_000 },
      }),
    )

    expect(result.message.sourceId).toBe("u5Buqc6lAghuOelnHUZV88DK2A==")
    expect(result.message.text).toBeUndefined()
    expect(result.message.contentAttributes).toBeUndefined()
  })

  test("leaves a plain text message untouched", async () => {
    const result = await run("im_receive_msg", inboundContent())

    expect(result.message.text).toBe("hello")
    expect(result.message.contentAttributes).toBeUndefined()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  // The row is still delivered — the warning is what makes the next unrendered
  // content type visible instead of silently blank, as `share_post` was.
  test("warns when a content type renders to nothing", async () => {
    const result = await run(
      "im_receive_msg",
      inboundContent({ type: "some_future_type", text: undefined }),
    )

    expect(result.message.text).toBeUndefined()
    expect(result.message.attachments).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "some_future_type" }),
      expect.stringContaining("empty message row"),
    )
  })
})

describe("receiveMessage — contact identity", () => {
  // TikTok documents `unique_identifier` as stable across its APIs, and the
  // `comment.update` webhook keys a commenter's contact by it. On an inbound
  // DM it equals `from_user.id`, which is what makes a commenter and a DM
  // sender resolve to the SAME ContactInbox with no merge step.
  test("keys an inbound contact by the id the comment webhook also sends", async () => {
    const result = await run("im_receive_msg", inboundContent())

    expect(result.contact.sourceId).toBe(CUSTOMER_UNIQUE_ID)
    expect(result.message.messageType).toBe("incoming")
  })

  // On an echo the roles reverse. `unique_identifier` is NOT documented to
  // follow, so reading it here would risk keying the contact to the business
  // account itself — `to_user` is the only trustworthy customer id.
  test("keys an echo contact by to_user, never by unique_identifier", async () => {
    const result = await run("im_send_msg", {
      ...inboundContent({ text: { body: "reply from the business" } }),
      unique_identifier: BUSINESS_OPEN_ID,
      from_user: { id: BUSINESS_OPEN_ID, role: "business_account" },
      to_user: { id: CUSTOMER_UNIQUE_ID, role: "personal_account" },
      from: "hunghero32",
      to: "wthzu_nb",
    })

    expect(result.contact.sourceId).toBe(CUSTOMER_UNIQUE_ID)
    expect(result.message.messageType).toBe("outgoing")
  })
})
