import { describe, expect, test } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"

const receiveEcho = async (message: Record<string, unknown>) =>
  await receiveMessage({
    ctx: { auth: { metadata: { pageId: "page-1" } } } as never,
    data: {
      integrationType: "messenger",
      integrationIdentifier: "inbox-1",
      payload: {
        object: "page",
        entry: [
          {
            id: "page-1",
            time: 1,
            messaging: [
              {
                sender: { id: "page-1" },
                recipient: { id: "psid-1" },
                timestamp: 1,
                message: { mid: "mid-1", is_echo: true, ...message },
              },
            ],
          },
        ],
      },
    },
  })

describe("Messenger receiveMessage — echo app_id", () => {
  test("classifies an echo from Facebook Page Inbox as first-party", async () => {
    const result = await receiveEcho({ text: "hi", app_id: 26_390_203_743_090 })

    expect(result.echoOrigin).toBe("firstParty")
    expect(result.echoAppId).toBe("26390203743090")
  })

  test("classifies an echo from another app as third-party and reports its app id", async () => {
    const result = await receiveEcho({
      text: "hi",
      app_id: 1_517_776_481_860_111,
    })

    expect(result.echoOrigin).toBe("thirdParty")
    expect(result.echoAppId).toBe("1517776481860111")
  })

  test("accepts a string app_id as documented by Meta", async () => {
    const result = await receiveEcho({ text: "hi", app_id: "26390203743090" })

    expect(result.echoOrigin).toBe("firstParty")
    expect(result.echoAppId).toBe("26390203743090")
  })

  test("reports an unsafe-integer app_id as unknown instead of a rounded id", async () => {
    const result = await receiveEcho({ text: "hi", app_id: 2 ** 53 + 2 })

    expect(result.echoOrigin).toBeNull()
    expect(result.echoAppId).toBeNull()
  })

  test("leaves echoOrigin null for an echo without app_id and for a non-echo message", async () => {
    const echo = await receiveEcho({ text: "hi" })
    expect(echo.echoOrigin).toBeNull()

    const inbound = await receiveMessage({
      ctx: { auth: { metadata: { pageId: "page-1" } } } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: {
                    mid: "mid-2",
                    text: "hello",
                    app_id: 26_390_203_743_090,
                  },
                },
              ],
            },
          ],
        },
      },
    })
    expect(inbound.echoOrigin).toBeNull()
    expect(inbound.echoAppId).toBeNull()
  })
})

describe("Messenger receiveMessage — parsing stays lenient", () => {
  test("an unexpected app_id shape is treated as unknown instead of failing the webhook", async () => {
    const result = await receiveEcho({ text: "hi", app_id: null })

    expect(result.message?.text).toBe("hi")
    expect(result.echoOrigin).toBeNull()
    expect(result.echoAppId).toBeNull()
  })

  test("an unexpected template payload shape degrades to no title", async () => {
    const result = await receiveEcho({
      attachments: [
        {
          type: "template",
          title: 123,
          payload: { template_type: "generic", elements: "not-an-array" },
        },
      ],
    })

    expect(result.message?.text).toBeUndefined()
    expect(result.message?.attachments).toEqual([])
  })

  test("an inbound product share keeps no text (title only applies to echoes)", async () => {
    const result = await receiveMessage({
      ctx: { auth: { metadata: { pageId: "page-1" } } } as never,
      data: {
        integrationType: "messenger",
        integrationIdentifier: "inbox-1",
        payload: {
          object: "page",
          entry: [
            {
              id: "page-1",
              time: 1,
              messaging: [
                {
                  sender: { id: "psid-1" },
                  recipient: { id: "page-1" },
                  timestamp: 1,
                  message: {
                    mid: "mid-3",
                    attachments: [
                      {
                        type: "template",
                        payload: {
                          product: {
                            elements: [{ id: "1", title: "Shared product" }],
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    })

    expect(result.message?.messageType).toBe("incoming")
    expect(result.message?.text).toBeUndefined()
  })
})

describe("Messenger receiveMessage — template echo", () => {
  test("generic template echo stores the element titles as text and no attachment", async () => {
    const result = await receiveEcho({
      attachments: [
        {
          type: "template",
          title: "Sample product card",
          payload: {
            template_type: "generic",
            sharable: false,
            elements: [
              {
                title: "Sample product card",
                image_url: "https://example.com/card.jpg",
                subtitle: "Sample subtitle",
              },
            ],
          },
        },
      ],
    })

    expect(result.message?.messageType).toBe("outgoing")
    expect(result.message?.text).toBe("Sample product card")
    expect(result.message?.attachments).toEqual([])
  })

  test("carousel echo joins every card title", async () => {
    const result = await receiveEcho({
      attachments: [
        {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [{ title: "Card A" }, { title: "Card B" }],
          },
        },
      ],
    })

    expect(result.message?.text).toBe("Card A\nCard B")
  })

  test("button template echo stores the template text", async () => {
    const result = await receiveEcho({
      attachments: [
        {
          type: "template",
          payload: {
            template_type: "button",
            text: "Pick an option",
            buttons: [{ type: "web_url", url: "https://x.y", title: "Go" }],
          },
        },
      ],
    })

    expect(result.message?.text).toBe("Pick an option")
  })

  test("product template echo stores the product titles", async () => {
    const result = await receiveEcho({
      attachments: [
        {
          type: "template",
          payload: {
            product: {
              elements: [{ id: "1", title: "Some product", subtitle: "40" }],
            },
          },
        },
      ],
    })

    expect(result.message?.text).toBe("Some product")
  })

  test("media template echo has no title and leaves text undefined", async () => {
    const result = await receiveEcho({
      attachments: [
        {
          type: "template",
          title: "",
          url: "https://www.facebook.com/commerce/update/",
          payload: {
            template_type: "media",
            elements: [
              { media_type: "image", attachment_id: 2_457_235_337_685_388 },
            ],
          },
        },
      ],
    })

    expect(result.message?.text).toBeUndefined()
    expect(result.message?.attachments).toEqual([])
  })

  test("explicit message text wins over the template title", async () => {
    const result = await receiveEcho({
      text: "hello",
      attachments: [
        {
          type: "template",
          payload: { template_type: "generic", elements: [{ title: "Card" }] },
        },
      ],
    })

    expect(result.message?.text).toBe("hello")
  })
})
