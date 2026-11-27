// @vitest-environment node

import {
  parseEmbeddedVideoSource,
  toEmbeddedVideoView,
} from "@chatbotx.io/utils/embedded-video"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  template: null as Record<string, unknown> | null,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/components/public-message", () => ({
  PublicMessage: () => null,
}))
vi.mock("@/features/templates/components/public-install-section", () => ({
  InstallSection: () => <div data-testid="install-section" />,
}))
vi.mock("@/app/t/[shareToken]/share-page-data", () => ({
  findPublicTemplate: () => Promise.resolve(mocks.template),
  getShareViewer: () => Promise.resolve({ id: "7" }),
  resolveTemplateImageUrl: () => Promise.resolve("https://cdn.test/cover.png"),
}))

import PublicTemplateInstallPage from "@/app/t/[shareToken]/install/page"

const render = async () =>
  renderToStaticMarkup(
    await PublicTemplateInstallPage({
      params: Promise.resolve({ shareToken: "tok" }),
    }),
  )

const viewOf = (source: string) => {
  const parsed = parseEmbeddedVideoSource(source)
  if (!parsed.ok) {
    throw new Error(`fixture does not parse: ${parsed.reason}`)
  }
  return toEmbeddedVideoView(parsed.video)
}

describe("template install page heading", () => {
  beforeEach(() => {
    mocks.template = { name: "Starter", imageUrl: "x", video: null }
  })

  test("opens with the cover image when the template has no video", async () => {
    const html = await render()

    expect(html).toContain('src="https://cdn.test/cover.png"')
    expect(html).not.toContain("<iframe")
    expect(html).toContain("Starter")
  })

  test("shows the video in the cover's place when the template has one", async () => {
    mocks.template = {
      name: "Starter",
      imageUrl: "x",
      video: viewOf("https://vimeo.com/76979871"),
    }
    const html = await render()

    expect(html).toContain('src="https://player.vimeo.com/video/76979871')
    expect(html).toContain('title="videoTitle"')
    expect(html).not.toContain("<img")
    expect(html.indexOf("<iframe")).toBeLessThan(html.indexOf("<h1"))
  })
})
