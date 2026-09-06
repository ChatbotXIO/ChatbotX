import { describe, expect, test } from "vitest"
import {
  MM_MAX_QUICK_REPLIES,
  mmContentDefaultFn,
  mmContentSchema,
} from "@/features/facebook-marketing-messages/schema/content"

const webUrlButton = {
  id: "1",
  title: "Shop now",
  actionType: "openWebsite" as const,
  url: "https://example.com",
  browserSize: 100 as const,
}
const flowButton = {
  id: "2",
  title: "Learn more",
  actionType: "startExternalFlow" as const,
  flowId: "10",
}
const nodeButton = {
  id: "3",
  title: "Get offer",
  actionType: "startExternalNode" as const,
  flowId: "10",
  nodeId: "20",
}
const mediaRef = {
  id: "9",
  mode: "file" as const,
  url: "https://cdn.example.com/a.jpg",
}

describe("mmContentSchema — text template", () => {
  test("accepts text at the 640 character limit", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "a".repeat(640),
      quickReplies: [],
    })

    expect(parsed.success).toBe(true)
  })

  test("rejects text one character over the limit", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "a".repeat(641),
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects empty text", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "   ",
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })
})

describe("mmContentSchema — button template", () => {
  test("accepts three buttons", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "button",
      text: "Pick one",
      buttons: [webUrlButton, flowButton, nodeButton],
      quickReplies: [],
    })

    expect(parsed.success).toBe(true)
  })

  test("rejects four buttons", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "button",
      text: "Pick one",
      buttons: [
        webUrlButton,
        flowButton,
        nodeButton,
        { ...webUrlButton, id: "4" },
      ],
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })

  test("requires at least one button", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "button",
      text: "Pick one",
      buttons: [],
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects a button label over 20 characters", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "button",
      text: "Pick one",
      buttons: [{ ...webUrlButton, title: "a".repeat(21) }],
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })
})

describe("mmContentSchema — media template", () => {
  test("accepts an image with up to three buttons", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "media",
      mediaType: "image",
      media: mediaRef,
      buttons: [webUrlButton, flowButton, nodeButton],
      quickReplies: [],
    })

    expect(parsed.success).toBe(true)
  })

  test("rejects a media type Meta does not support", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "media",
      mediaType: "audio",
      media: mediaRef,
      buttons: [],
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })

  test("still rejects an empty media URL — media is required, unlike an element image", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "media",
      mediaType: "image",
      media: { ...mediaRef, url: "" },
      buttons: [],
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })

  test("carries an optional attachmentId filled in at save time", () => {
    const parsed = mmContentSchema.parse({
      templateType: "media",
      mediaType: "video",
      media: { ...mediaRef, attachmentId: "att_1" },
      buttons: [],
      quickReplies: [],
    })

    expect(parsed.templateType).toBe("media")
    if (parsed.templateType === "media") {
      expect(parsed.media.attachmentId).toBe("att_1")
    }
  })
})

describe("mmContentSchema — generic template", () => {
  const element = {
    id: "101",
    title: "Product",
    subtitle: "Nice",
    image: mediaRef,
    buttons: [webUrlButton],
  }

  test("accepts the editor's own default — an element with no image chosen", () => {
    // `mmGenericElementDefaultFn` seeds `image.url: ""` so the media picker has
    // an object to bind to. A blank card the user only typed a title into must
    // validate, or the form can never be submitted without attaching an image.
    const defaults = mmContentDefaultFn("generic")
    expect(defaults.templateType).toBe("generic")
    if (defaults.templateType !== "generic") {
      return
    }

    const parsed = mmContentSchema.safeParse({
      ...defaults,
      elements: [{ ...defaults.elements[0], title: "Product" }],
    })

    expect(parsed.success).toBe(true)
  })

  test("rejects an element image URL that is neither empty nor a URL", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "generic",
      elements: [{ ...element, image: { ...mediaRef, url: "not-a-url" } }],
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })

  test("accepts ten elements", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "generic",
      elements: Array.from({ length: 10 }, (_, i) => ({
        ...element,
        id: `${100 + i}`,
      })),
      quickReplies: [],
    })

    expect(parsed.success).toBe(true)
  })

  test("rejects eleven elements", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "generic",
      elements: Array.from({ length: 11 }, (_, i) => ({
        ...element,
        id: `${100 + i}`,
      })),
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })

  test("allows a 250 character subtitle — Marketing Messages exceeds the usual 80", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "generic",
      elements: [{ ...element, subtitle: "a".repeat(250) }],
      quickReplies: [],
    })

    expect(parsed.success).toBe(true)
  })

  test("rejects a subtitle over 250 characters", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "generic",
      elements: [{ ...element, subtitle: "a".repeat(251) }],
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects a title over 80 characters", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "generic",
      elements: [{ ...element, title: "a".repeat(81) }],
      quickReplies: [],
    })

    expect(parsed.success).toBe(false)
  })
})

describe("mmContentSchema — quick replies", () => {
  const textReply = {
    id: "201",
    contentType: "text" as const,
    title: "Yes",
    action: { actionType: "startExternalFlow" as const, flowId: "10" },
  }

  test("MM_MAX_QUICK_REPLIES is Meta's documented 13, not the flow package's 10", () => {
    expect(MM_MAX_QUICK_REPLIES).toBe(13)
  })

  test("accepts thirteen quick replies", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "Hi",
      quickReplies: Array.from({ length: 13 }, (_, i) => ({
        ...textReply,
        id: `${200 + i}`,
      })),
    })

    expect(parsed.success).toBe(true)
  })

  test("rejects fourteen quick replies", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "Hi",
      quickReplies: Array.from({ length: 14 }, (_, i) => ({
        ...textReply,
        id: `${200 + i}`,
      })),
    })

    expect(parsed.success).toBe(false)
  })

  test("accepts the phone and email content types", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "Hi",
      quickReplies: [
        {
          id: "201",
          contentType: "user_phone_number",
          action: { actionType: "startExternalFlow", flowId: "10" },
        },
        {
          id: "202",
          contentType: "user_email",
          action: {
            actionType: "startExternalNode",
            flowId: "10",
            nodeId: "20",
          },
        },
      ],
    })

    expect(parsed.success).toBe(true)
  })

  test("accepts phone and email replies with no action at all", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "Hi",
      quickReplies: [
        { id: "201", contentType: "user_phone_number" },
        { id: "202", contentType: "user_email" },
      ],
    })

    expect(parsed.success).toBe(true)
  })

  test("still requires an action on a text reply", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "Hi",
      quickReplies: [{ id: "201", contentType: "text", title: "Go" }],
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects a half-filled action on a phone reply — optional, not lenient", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "Hi",
      quickReplies: [
        {
          id: "201",
          contentType: "user_phone_number",
          action: { actionType: "startExternalFlow", flowId: "" },
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects a web_url action on a quick reply — Meta has no URL quick reply", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "Hi",
      quickReplies: [
        {
          id: "201",
          contentType: "text",
          title: "Go",
          action: {
            actionType: "openWebsite",
            url: "https://example.com",
            browserSize: 100,
          },
        },
      ],
    })

    expect(parsed.success).toBe(false)
  })

  test("rejects a quick reply title over 20 characters", () => {
    const parsed = mmContentSchema.safeParse({
      templateType: "text",
      text: "Hi",
      quickReplies: [{ ...textReply, title: "a".repeat(21) }],
    })

    expect(parsed.success).toBe(false)
  })
})
