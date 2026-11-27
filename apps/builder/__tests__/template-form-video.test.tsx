// @vitest-environment jsdom

import {
  type EmbeddedVideo,
  parseEmbeddedVideoSource,
  toEmbeddedVideoView,
} from "@chatbotx.io/utils/embedded-video"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { TemplateForm } from "@/features/templates/components/template-form"

vi.mock("next-intl", () => {
  const translate = (key: string) => key
  translate.has = () => false
  return { useTranslations: () => translate }
})
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ storageUrl: "https://storage.test" }),
}))
vi.mock("@/features/templates/actions/save-template.action", () => {
  const save = vi.fn()
  return { saveTemplateAction: Object.assign(save, { bind: () => save }) }
})
vi.mock("@/features/templates/components/template-contents-card", () => ({
  TemplateContentsCard: () => null,
}))
vi.mock("@/features/templates/components/template-cover-image-field", () => ({
  TemplateCoverImageField: () => <div data-testid="cover-field" />,
}))

const VIMEO = "https://vimeo.com/76979871"
const LEGACY_YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

describe("template form video field", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderForm(savedVideo?: EmbeddedVideo) {
    act(() =>
      root.render(
        <TemplateForm
          savedVideo={savedVideo}
          selectableCategories={[]}
          workspaceId="1"
        />,
      ),
    )
    return {
      field: container.querySelector<HTMLTextAreaElement>(
        'textarea[name="video.source"]',
      ),
      frame: container.querySelector<HTMLElement>(
        '[data-testid="template-video-frame"]',
      ),
      iframe: container.querySelector("iframe"),
    }
  }

  /** The stored video for a link; `aspectRatio` overrides the one the link hints. */
  const videoOf = (
    source: string,
    aspectRatio?: number | null,
  ): EmbeddedVideo => {
    const parsed = parseEmbeddedVideoSource(source)
    if (!parsed.ok) {
      throw new Error("fixture must parse")
    }
    return {
      ...parsed.video,
      aspectRatio:
        aspectRatio === undefined ? parsed.hintedAspectRatio : aspectRatio,
    }
  }
  const viewOf = (source: string) => toEmbeddedVideoView(videoOf(source))

  /** Types `text` into the video field the way a user does. */
  function type(field: HTMLTextAreaElement, text: string) {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set
    act(() => {
      setValue?.call(field, text)
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  test.each([
    ["a Vimeo link", VIMEO],
    ["a legacy YouTube link", LEGACY_YOUTUBE],
  ])("prefills %s and plays it inside the preview frame", (_label, source) => {
    const { field, frame, iframe } = renderForm(videoOf(source))

    expect(field?.value).toBe(viewOf(source).source)
    expect(frame?.contains(iframe)).toBe(true)
  })

  test("puts the video field next to the cover image field", () => {
    const { frame } = renderForm()
    const cover = container.querySelector('[data-testid="cover-field"]')

    expect(frame).not.toBeNull()
    const grid = cover?.closest(".md\\:grid-cols-2")
    expect(grid).not.toBeNull()
    expect(grid?.contains(frame)).toBe(true)
  })

  test("without a video the field is empty and the frame shows the empty state", () => {
    const { field, frame, iframe } = renderForm()

    expect(field?.value).toBe("")
    expect(frame?.querySelector("svg")).not.toBeNull()
    expect(frame?.textContent).toContain("templates.form.videoEmpty")
    expect(iframe).toBeNull()
  })

  test("an unsupported link keeps the empty state", () => {
    const { field, frame } = renderForm()

    type(field as HTMLTextAreaElement, "https://example.com/video")

    expect(frame?.querySelector("iframe")).toBeNull()
    expect(frame?.textContent).toContain("templates.form.videoEmpty")
  })

  test("a typed link plays inside the frame, landscape filling it", () => {
    const { field, frame } = renderForm()

    type(field as HTMLTextAreaElement, LEGACY_YOUTUBE)

    const box = frame?.querySelector("iframe")?.parentElement
    expect(box?.className).toContain("w-full")
    expect(box?.className).not.toContain("max-w-3xl")
  })

  test("a portrait video is fitted by height inside the frame", () => {
    const { field, frame } = renderForm()

    type(
      field as HTMLTextAreaElement,
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    )

    const box = frame?.querySelector("iframe")?.parentElement
    expect(box?.className).toContain("h-full")
    expect(box?.style.aspectRatio).toBe("0.5625")
  })

  test("the same video as the saved one uses the stored ratio", () => {
    const saved = videoOf(LEGACY_YOUTUBE, 0.75)
    const { field, frame } = renderForm(saved)

    type(field as HTMLTextAreaElement, "https://youtu.be/dQw4w9WgXcQ")

    const box = frame?.querySelector("iframe")?.parentElement
    expect(box?.className).toContain("h-full")
    expect(box?.style.aspectRatio).toBe("0.75")
  })

  test("a different video does not borrow the saved ratio", () => {
    const { field, frame } = renderForm(videoOf(LEGACY_YOUTUBE, 0.75))

    type(
      field as HTMLTextAreaElement,
      "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    )

    const box = frame?.querySelector("iframe")?.parentElement
    expect(box?.className).toContain("w-full")
  })

  test("says orientation is detected on save for a new Vimeo link", () => {
    const { field } = renderForm()

    type(field as HTMLTextAreaElement, VIMEO)

    expect(container.textContent).toContain(
      "templates.form.videoOrientationNote",
    )
  })

  test("no note for a YouTube link, nor for the saved Vimeo video", () => {
    const { field } = renderForm(videoOf(VIMEO, 0.563))

    expect(container.textContent).not.toContain("videoOrientationNote")
    type(field as HTMLTextAreaElement, LEGACY_YOUTUBE)
    expect(container.textContent).not.toContain("videoOrientationNote")
  })

  test("a ratio in the typed link wins over the saved video's stored ratio", () => {
    const { field, frame } = renderForm(videoOf(LEGACY_YOUTUBE, 0.5))

    type(
      field as HTMLTextAreaElement,
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    )

    const box = frame?.querySelector("iframe")?.parentElement
    expect(box?.className).toContain("h-full")
    expect(box?.style.aspectRatio).toBe("0.5625")
  })

  test("a saved Vimeo video with no stored ratio still shows the note", () => {
    renderForm(videoOf(VIMEO, null))

    expect(container.textContent).toContain(
      "templates.form.videoOrientationNote",
    )
  })

  test("labels the video field and marks it optional", () => {
    const { field } = renderForm()
    const label = container.querySelector(`label[for="${field?.id}"]`)

    expect(label?.textContent).toContain("templates.form.video")
    expect(field?.hasAttribute("aria-label")).toBe(false)
  })
})
