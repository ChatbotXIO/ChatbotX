// @vitest-environment node

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
        youtubeVideoId: null,
        testLink: "https://bot.test/try",
        categoryCounts: { flows: 2 },
        ...overrides,
      } as never,
    }),
  )

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
})
