import {
  type EmbeddedVideoView,
  parseEmbeddedVideoSource,
  toEmbeddedVideoView,
} from "@chatbotx.io/utils/embedded-video"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { EmbeddedVideoPlayer } from "@/components/embedded-video-player"

const viewOf = (source: string): EmbeddedVideoView => {
  const parsed = parseEmbeddedVideoSource(source)
  if (!parsed.ok) {
    throw new Error(`fixture does not parse: ${parsed.reason}`)
  }
  return toEmbeddedVideoView(parsed.video)
}

const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
const SHORT = "https://www.youtube.com/shorts/2CkofPRY3V4"
const FILE = "https://res.cloudinary.com/demo/video/upload/dog.mp4"

describe("embedded video player: iframe", () => {
  test("renders the rebuilt src with the provider's allow, a referrer policy, lazy loading and the title", () => {
    const view = viewOf(YOUTUBE)
    const html = renderToStaticMarkup(
      <EmbeddedVideoPlayer title="Template preview video" video={view} />,
    )

    expect(view.playback.kind).toBe("iframe")
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"',
    )
    expect(html).toContain(
      'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"',
    )
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('title="Template preview video"')
    expect(html).toContain("allowFullScreen")
    expect(html).not.toContain("sandbox")
  })

  test("takes the src only from the view's playback, never from its source link", () => {
    const view: EmbeddedVideoView = {
      ...viewOf(YOUTUBE),
      source: "https://evil.example/x",
    }
    const html = renderToStaticMarkup(
      <EmbeddedVideoPlayer title="t" video={view} />,
    )

    expect(html).not.toContain("evil.example")
  })

  test("sizes a landscape video like the cover it replaces and reserves its box from the ratio", () => {
    const view = viewOf(YOUTUBE)
    const html = renderToStaticMarkup(
      <EmbeddedVideoPlayer title="t" video={view} />,
    )

    expect(html).toContain("w-full max-w-3xl")
    expect(html).toContain(`aspect-ratio:${view.aspectRatio}`)
    expect(html).not.toContain("mx-auto")
  })

  test("centers a portrait video, caps its height and never lets it overflow", () => {
    const view = viewOf(SHORT)
    const html = renderToStaticMarkup(
      <EmbeddedVideoPlayer title="t" video={view} />,
    )

    expect(view.aspectRatio).toBeLessThan(1)
    expect(html).toContain("mx-auto")
    expect(html).toContain(`aspect-ratio:${view.aspectRatio}`)
    expect(html).toContain(
      `width:min(100%, calc(min(70vh, 640px) * ${view.aspectRatio}))`,
    )
    expect(html).not.toContain("max-w-3xl")
  })
})

describe("embedded video player: file", () => {
  let container: HTMLDivElement
  let root: Root
  // Prototype accessors a test replaced, to put the originals back.
  let restoreStubs: Array<() => void> = []

  /** Makes every <video> report `value` for `property`, until the test ends. */
  const stubMediaProperty = (
    prototype: object,
    property: string,
    value: unknown,
  ) => {
    const original = Object.getOwnPropertyDescriptor(prototype, property)
    Object.defineProperty(prototype, property, {
      configurable: true,
      get: () => value,
    })
    restoreStubs.push(() => {
      if (original) {
        Object.defineProperty(prototype, property, original)
      } else {
        Reflect.deleteProperty(prototype, property)
      }
    })
  }

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    for (const restore of restoreStubs.reverse()) {
      restore()
    }
    restoreStubs = []
    act(() => root.unmount())
    container.remove()
  })

  const renderFile = (coverUrl?: string) => {
    act(() => {
      root.render(
        <EmbeddedVideoPlayer
          coverUrl={coverUrl}
          title="Template preview video"
          video={viewOf(FILE)}
        />,
      )
    })
    return container.querySelector("video")
  }

  test("plays the file with controls, inline, metadata-only preload and the cover as poster", () => {
    const video = renderFile("https://cdn.test/cover.png")

    expect(video?.getAttribute("src")).toBe(FILE)
    expect(video?.hasAttribute("controls")).toBe(true)
    expect(video?.hasAttribute("playsinline")).toBe(true)
    expect(video?.getAttribute("preload")).toBe("metadata")
    expect(video?.getAttribute("poster")).toBe("https://cdn.test/cover.png")
    expect(video?.getAttribute("aria-label")).toBe("Template preview video")
    expect(container.querySelector("iframe")).toBeNull()
  })

  test("resizes the box to the file's real ratio once its metadata loads", () => {
    const video = renderFile()
    expect(video).not.toBeNull()
    if (!video) {
      return
    }
    Object.defineProperty(video, "videoWidth", { value: 720 })
    Object.defineProperty(video, "videoHeight", { value: 1280 })

    act(() => {
      video.dispatchEvent(new Event("loadedmetadata"))
    })

    const box = container.firstElementChild as HTMLElement
    expect(Number.parseFloat(box.style.aspectRatio)).toBeCloseTo(0.5625)
    expect(box.className).toContain("mx-auto")
  })

  test("shows the cover image instead when the file fails to load", () => {
    const video = renderFile("https://cdn.test/cover.png")

    act(() => {
      video?.dispatchEvent(new Event("error"))
    })

    expect(container.querySelector("video")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/cover.png",
    )
  })

  test("shows the cover when the file already failed before React could listen for the error", () => {
    // A server-rendered <video> can error before hydration attaches onError.
    stubMediaProperty(HTMLMediaElement.prototype, "error", { code: 4 })

    renderFile("https://cdn.test/cover.png")

    expect(container.querySelector("video")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/cover.png",
    )
  })

  test("uses the real ratio when the metadata loaded before React could listen for it", () => {
    stubMediaProperty(HTMLMediaElement.prototype, "readyState", 1)
    stubMediaProperty(HTMLVideoElement.prototype, "videoWidth", 720)
    stubMediaProperty(HTMLVideoElement.prototype, "videoHeight", 1280)

    renderFile()

    const box = container.firstElementChild as HTMLElement
    expect(Number.parseFloat(box.style.aspectRatio)).toBeCloseTo(0.5625)
    expect(box.className).toContain("mx-auto")
  })

  test("shows an empty frame, not a broken player, when a failed file has no cover", () => {
    const video = renderFile()

    act(() => {
      video?.dispatchEvent(new Event("error"))
    })

    expect(container.querySelector("video")).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    expect(container.firstElementChild).not.toBeNull()
  })
})
