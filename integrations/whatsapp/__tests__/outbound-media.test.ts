import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  ActionButtons,
  Body,
  Button,
  Document,
  Header,
  Image,
  Interactive,
  Video,
} from "whatsapp-api-js/messages"

const mockResolveOutboundMediaUrl = vi.fn(
  async ({ url }: { url: string }) => `https://cdn.test/rehosted?src=${url}`,
)

vi.mock("@chatbotx.io/business/outbound-media", () => ({
  resolveOutboundMediaUrl: mockResolveOutboundMediaUrl,
}))

const { collectMediaLinks, prepareOutboundMedia, WHATSAPP_MEDIA_RULES } =
  await import("../src/handlers/message/outgoing-message/outbound-media")

const ctx = {
  storagePrefix: "public/ws/ws_1/2026/11/05",
  platform: { storageUrl: "https://cdn.test" },
}

beforeEach(() => {
  mockResolveOutboundMediaUrl.mockClear()
})

describe("collectMediaLinks", () => {
  test("finds a top-level whatsapp-api-js media message by its _type", () => {
    const image = new Image("https://x.test/a.jpg")
    const video = new Video("https://x.test/a.mp4")

    expect(collectMediaLinks(image)).toEqual([{ holder: image, kind: "image" }])
    expect(collectMediaLinks(video)).toEqual([{ holder: video, kind: "video" }])
  })

  test("skips documents and media sent by id", () => {
    expect(collectMediaLinks(new Document("https://x.test/a.pdf"))).toEqual([])
    expect(collectMediaLinks(new Image("media-id-123", true))).toEqual([])
  })

  test("finds the image header of an interactive message", () => {
    const message = new Interactive(
      new ActionButtons(new Button("b1", "Yes")),
      new Body("Pick one"),
      new Header(new Image("https://x.test/header.jpg")),
    )

    const links = collectMediaLinks(message)

    expect(links).toHaveLength(1)
    expect(links[0]?.kind).toBe("image")
    expect(links[0]?.holder.link).toBe("https://x.test/header.jpg")
  })

  test("finds media nested under a kind key in raw template and carousel payloads", () => {
    const template = {
      _type: "template",
      components: [
        {
          type: "header",
          parameters: [
            { type: "image", image: { link: "https://x.test/t.jpg" } },
          ],
        },
        {
          type: "carousel",
          cards: [
            {
              components: [
                {
                  type: "header",
                  parameters: [
                    { type: "video", video: { link: "https://x.test/c.mp4" } },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "header",
          parameters: [
            { type: "document", document: { link: "https://x.test/d.pdf" } },
          ],
        },
      ],
    }

    const links = collectMediaLinks(template).map(({ holder, kind }) => [
      kind,
      holder.link,
    ])

    expect(links).toEqual([
      ["image", "https://x.test/t.jpg"],
      ["video", "https://x.test/c.mp4"],
    ])
  })
})

describe("prepareOutboundMedia", () => {
  test("rewrites each media link with the resolved URL and WhatsApp's rules", async () => {
    const message = new Interactive(
      new ActionButtons(new Button("b1", "Yes")),
      new Body("Pick one"),
      new Header(new Image("https://x.test/header.jpg")),
    )

    await prepareOutboundMedia(message, ctx)

    expect(collectMediaLinks(message)[0]?.holder.link).toBe(
      "https://cdn.test/rehosted?src=https://x.test/header.jpg",
    )
    expect(mockResolveOutboundMediaUrl).toHaveBeenCalledWith({
      url: "https://x.test/header.jpg",
      ...WHATSAPP_MEDIA_RULES.image,
      storagePrefix: ctx.storagePrefix,
      storageUrl: ctx.platform.storageUrl,
    })
  })

  test("sends links as-is when the context has no storage target", async () => {
    const image = new Image("https://x.test/a.jpg")

    await prepareOutboundMedia(image, { storagePrefix: ctx.storagePrefix })

    expect(image.link).toBe("https://x.test/a.jpg")
    expect(mockResolveOutboundMediaUrl).not.toHaveBeenCalled()
  })

  test("does nothing for a message without media", async () => {
    await prepareOutboundMedia({ _type: "text", body: "hi" }, ctx)

    expect(mockResolveOutboundMediaUrl).not.toHaveBeenCalled()
  })
})
