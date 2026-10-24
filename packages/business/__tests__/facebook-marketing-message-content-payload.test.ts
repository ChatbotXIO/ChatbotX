import { encodeButtonPayload } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  buildMarketingMessagePayload,
  summarizeMarketingMessage,
} from "../src/facebook-marketing-message-delivery/content-payload"

const web = {
  id: "21",
  title: "Open",
  actionType: "openWebsite" as const,
  url: "https://example.com",
  browserSize: 100 as const,
}
const postback = {
  id: "22",
  title: "Go",
  actionType: "startExternalFlow" as const,
  flowId: "11",
}

describe("buildMarketingMessagePayload", () => {
  test("text", () => {
    const content = {
      templateType: "text",
      text: "Hi",
      quickReplies: [],
    } as const
    expect(buildMarketingMessagePayload(content)).toEqual({ text: "Hi" })
    expect(summarizeMarketingMessage(content)).toBe("Hi")
  })

  test("button with web_url and postback", () => {
    const payload = buildMarketingMessagePayload({
      templateType: "button",
      text: "Pick",
      buttons: [web, postback, { ...web, id: "23", browserSize: 40 }],
      quickReplies: [],
    }) as any
    expect(payload.attachment.payload.template_type).toBe("button")
    expect(payload.attachment.payload.text).toBe("Pick")
    const [b0, b1, b2] = payload.attachment.payload.buttons
    expect(b0).toEqual({
      type: "web_url",
      title: "Open",
      url: "https://example.com",
      webview_height_ratio: "full",
    })
    expect(b1).toEqual({
      type: "postback",
      title: "Go",
      payload: encodeButtonPayload({ flowId: "11" }),
    })
    expect(b2.webview_height_ratio).toBe("compact")
  })

  test("startExternalNode uses the flowId and nodeId", () => {
    const payload = buildMarketingMessagePayload({
      templateType: "button",
      text: "Pick",
      buttons: [
        {
          id: "5",
          title: "N",
          actionType: "startExternalNode",
          flowId: "11",
          nodeId: "9",
        },
      ],
      quickReplies: [],
    }) as any
    expect(payload.attachment.payload.buttons[0].payload).toBe(
      encodeButtonPayload({ flowId: "11", nodeId: "9" }),
    )
  })

  test("media prefers attachment_id", () => {
    const base = {
      templateType: "media",
      mediaType: "image",
      buttons: [web],
      quickReplies: [],
    } as const
    const a = buildMarketingMessagePayload({
      ...base,
      media: {
        id: "1",
        mode: "upload",
        url: "https://x.com/a.png",
        attachmentId: "A1",
      },
    } as any) as any
    const el = a.attachment.payload.elements[0]
    expect(el.media_type).toBe("image")
    expect(el.attachment_id).toBe("A1")
    expect("url" in el).toBe(false)
    expect(el.buttons[0].type).toBe("web_url")
    const b = buildMarketingMessagePayload({
      ...base,
      media: { id: "1", mode: "upload", url: "https://x.com/a.png" },
    } as any) as any
    expect(b.attachment.payload.elements[0].url).toBe("https://x.com/a.png")
    expect("attachment_id" in b.attachment.payload.elements[0]).toBe(false)
  })

  test("generic greeting and empty image", () => {
    const content = {
      templateType: "generic",
      greeting: "Hello",
      elements: [
        {
          id: "1",
          title: "T",
          image: { id: "2", mode: "url", url: "" },
          buttons: [],
        },
        {
          id: "3",
          title: "U",
          subtitle: "S",
          image: { id: "4", mode: "url", url: "https://x.com/i.png" },
          buttons: [web],
        },
      ],
      quickReplies: [],
    } as any
    const payload = buildMarketingMessagePayload(content) as any
    expect(payload.attachment.payload.text).toBe("Hello")
    const [e0, e1] = payload.attachment.payload.elements
    expect("image_url" in e0).toBe(false)
    expect(e1.image_url).toBe("https://x.com/i.png")
    expect(e1.subtitle).toBe("S")
    expect(summarizeMarketingMessage(content)).toBe("Hello")
    expect(summarizeMarketingMessage({ ...content, greeting: undefined })).toBe(
      "T",
    )
  })

  test("quick replies", () => {
    const payload = buildMarketingMessagePayload({
      templateType: "text",
      text: "Hi",
      quickReplies: [
        { contentType: "user_email", id: "1" },
        {
          contentType: "user_phone_number",
          id: "2",
          action: { actionType: "startExternalFlow", flowId: "11" },
        },
        {
          contentType: "text",
          id: "3",
          title: "Yes",
          action: { actionType: "startExternalFlow", flowId: "11" },
        },
      ],
    }) as any
    const [q0, q1, q2] = payload.quick_replies
    expect(q0).toEqual({ content_type: "user_email" })
    expect(q1).toEqual({
      content_type: "user_phone_number",
      payload: encodeButtonPayload({ flowId: "11" }),
    })
    expect(q2.title).toBe("Yes")
    expect(q2.payload).toBe(encodeButtonPayload({ flowId: "11" }))
  })
})
