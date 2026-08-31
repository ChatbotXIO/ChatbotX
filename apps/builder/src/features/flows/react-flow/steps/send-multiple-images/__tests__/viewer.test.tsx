// @vitest-environment jsdom
import { sendMultipleImagesItemDefaultFn } from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import SendMultipleImagesStepViewer from "../viewer"

const mocks = vi.hoisted(() => ({
  useDynamicImagePreview: vi.fn(),
}))

vi.mock("@/features/dynamic-images/hooks/use-dynamic-image-preview", () => ({
  useDynamicImagePreview: mocks.useDynamicImagePreview,
}))

vi.mock("@/features/dynamic-images/components/preview-placeholder", () => ({
  DynamicImagePreviewPlaceholder: ({ hasError }: { hasError: boolean }) =>
    hasError ? <span data-testid="preview-placeholder" /> : null,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  mocks.useDynamicImagePreview.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui)
  })
}

const makeStep = (imageCount: number) => ({
  id: "step-1",
  stepType: "sendMultipleImages" as const,
  images: Array.from({ length: imageCount }, (_, index) => ({
    ...sendMultipleImagesItemDefaultFn(),
    id: `img-${index}`,
    url: `https://example.com/${index}.png`,
  })),
})

describe("SendMultipleImagesStepViewer", () => {
  test("renders one grid image per step image, each resolved independently", () => {
    mocks.useDynamicImagePreview.mockImplementation((url: string) => ({
      url,
      hasError: false,
    }))

    render(<SendMultipleImagesStepViewer data={makeStep(4)} />)

    expect(container.querySelectorAll("img")).toHaveLength(4)
    expect(mocks.useDynamicImagePreview).toHaveBeenCalledWith(
      "https://example.com/0.png",
    )
    expect(mocks.useDynamicImagePreview).toHaveBeenCalledWith(
      "https://example.com/3.png",
    )
  })

  test("only 2 images still render as a (partial) grid", () => {
    mocks.useDynamicImagePreview.mockReturnValue({
      url: "https://example.com/preview.png",
      hasError: false,
    })

    render(<SendMultipleImagesStepViewer data={makeStep(2)} />)

    expect(container.querySelectorAll("img")).toHaveLength(2)
  })

  test("renders the error placeholder for an image whose preview failed", () => {
    mocks.useDynamicImagePreview.mockReturnValue({
      url: undefined,
      hasError: true,
    })

    render(<SendMultipleImagesStepViewer data={makeStep(2)} />)

    expect(
      container.querySelectorAll('[data-testid="preview-placeholder"]'),
    ).toHaveLength(2)
  })

  test("renders nothing for a slot with no url and no error yet", () => {
    mocks.useDynamicImagePreview.mockReturnValue({
      url: undefined,
      hasError: false,
    })

    expect(() =>
      render(<SendMultipleImagesStepViewer data={makeStep(2)} />),
    ).not.toThrow()
    expect(container.querySelector("img")).toBeNull()
    expect(
      container.querySelector('[data-testid="preview-placeholder"]'),
    ).toBeNull()
  })
})
