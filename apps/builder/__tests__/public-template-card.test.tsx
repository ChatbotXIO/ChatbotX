// @vitest-environment node

import {
  fromYoutubeVideoId,
  parseEmbeddedVideoSource,
  toEmbeddedVideoView,
} from "@chatbotx.io/utils/embedded-video"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test, vi } from "vitest"
import { PublicTemplateCard } from "@/features/templates/components/public-template-card"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))

const render = async (overrides: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    await PublicTemplateCard({
      imageUrl: "https://cdn.test/cover.png",
      install: <button type="button">install</button>,
      template: {
        name: "Starter",
        publisherName: "Acme",
        description: "Line one",
        video: null,
        youtubeVideoId: null,
        testLink: "https://bot.test/try",
        categoryCounts: { flows: 2 },
        ...overrides,
      } as never,
    }),
  )

const viewOf = (source: string) => {
  const parsed = parseEmbeddedVideoSource(source)
  if (!parsed.ok) {
    throw new Error(`fixture does not parse: ${parsed.reason}`)
  }
  return toEmbeddedVideoView(parsed.video)
}

describe("public template card", () => {
  test("shows the cover, a Preview link in a new tab, Install and the About section", async () => {
    const html = await render()

    expect(html).toContain('src="https://cdn.test/cover.png"')
    expect(html).toContain('href="https://bot.test/try"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain("preview")
    expect(html).toContain("install")
    expect(html).toContain("aboutTemplate")
    expect(html).toContain("Line one")
  })

  test("opens with the cover in a 16:9 frame that it fills, then the name, and no publisher line", async () => {
    const html = await render()

    expect(html).toContain("aspect-video")
    expect(html).toContain("object-cover")
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("<h1"))
    expect(html).not.toContain("byPublisher")
    expect(html).not.toContain("Acme")
  })

  test("does not list what the template includes", async () => {
    expect(await render()).not.toContain("includes")
  })

  test("has no Preview without a safe test link and no About without a description", async () => {
    const html = await render({
      testLink: "javascript:alert(1)",
      description: null,
    })

    expect(html).not.toContain("preview")
    expect(html).not.toContain("aboutTemplate")
  })

  test("shows the video in the cover's place when the template has one", async () => {
    const html = await render({
      video: viewOf("https://vimeo.com/76979871"),
    })

    expect(html).toContain('src="https://player.vimeo.com/video/76979871')
    expect(html).toContain('title="videoTitle"')
    expect(html).not.toContain("<img")
    expect(html.indexOf("<iframe")).toBeLessThan(html.indexOf("<h1"))
  })

  test("falls back to the cover image when the template has no video", async () => {
    const html = await render({ video: null })

    expect(html).toContain('src="https://cdn.test/cover.png"')
    expect(html).not.toContain("<iframe")
  })

  test("plays a template that only has the legacy YouTube id like a new one", async () => {
    const legacy = fromYoutubeVideoId("dQw4w9WgXcQ")
    if (!legacy) {
      throw new Error("fixture id is valid")
    }
    const html = await render({ video: toEmbeddedVideoView(legacy) })

    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"',
    )
  })

  test("renders the video once, not again under the buttons", async () => {
    const html = await render({
      video: viewOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    })

    expect(html.match(/<iframe/g)).toHaveLength(1)
    expect(html.indexOf("<iframe")).toBeLessThan(html.indexOf("install"))
  })

  test("a file video gets the template cover as its poster", async () => {
    const html = await render({
      video: viewOf("https://res.cloudinary.com/demo/video/upload/dog.mp4"),
    })

    expect(html).toContain("<video")
    expect(html).toContain('poster="https://cdn.test/cover.png"')
  })
})
