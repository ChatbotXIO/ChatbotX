import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next/image", () => ({
  default: ({ src }: { src: string }) => <span data-image-src={src} />,
}))

const { MessengerTemplatePreview } = await import(
  "@/features/integration-messenger/message-templates/components/template-preview"
)

describe("MessengerTemplatePreview — URL button suffix", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const renderUrlButton = (url: string, suffix?: string) => {
    act(() => {
      root.render(
        <MessengerTemplatePreview
          bodyParams={[]}
          buttonParams={
            suffix === undefined
              ? []
              : [{ sub_type: "url", index: 0, text: suffix }]
          }
          components={[
            {
              type: "BUTTONS",
              buttons: [{ type: "URL", text: "Track Order", url }],
            },
          ]}
          headerParams={[]}
        />,
      )
    })
    return container.textContent
  }

  test("fills a positional {{1}} suffix", () => {
    expect(renderUrlButton("https://x.test/orders/{{1}}", "1234")).toContain(
      "https://x.test/orders/1234",
    )
  })

  test("fills a named {{url_suffix}} suffix (NAMED templates)", () => {
    expect(
      renderUrlButton("https://x.test/orders/{{url_suffix}}", "1234"),
    ).toContain("https://x.test/orders/1234")
  })

  test("shows a static URL unchanged", () => {
    expect(renderUrlButton("https://x.test/jobs/")).toContain(
      "https://x.test/jobs/",
    )
  })
})

describe("MessengerTemplatePreview — IMAGE header", () => {
  let container: HTMLDivElement
  let root: Root

  const IMAGE_URL = "https://scontent.example.com/header.png"

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const renderHeader = (
    headerHandle: string,
    headerParams: Array<{
      type?: string
      text?: string
      image?: { link: string }
    }>,
  ) => {
    act(() => {
      root.render(
        <MessengerTemplatePreview
          bodyParams={[]}
          buttonParams={[]}
          components={[
            {
              type: "HEADER",
              format: "IMAGE",
              text: "{{1}}",
              example: {
                header_text: ["The goods is imported"],
                header_handle: [headerHandle],
              },
            },
          ]}
          headerParams={headerParams}
        />,
      )
    })
    return {
      imageSrc: container
        .querySelector("[data-image-src]")
        ?.getAttribute("data-image-src"),
      text: container.textContent,
    }
  }

  // Broadcast/flow editors pass only send-time params, and a Messenger image
  // is fixed at template creation — so the preview reads the template's own
  // header_handle, like the template management view does.
  test("shows the template's own header image when no image param is passed", () => {
    const { imageSrc, text } = renderHeader(IMAGE_URL, [
      { type: "text", text: "Imported" },
    ])
    expect(imageSrc).toBe(IMAGE_URL)
    expect(text).toContain("Imported")
  })

  test("an explicit image param still wins", () => {
    const { imageSrc } = renderHeader(IMAGE_URL, [
      { type: "image", image: { link: "https://x.test/other.png" } },
    ])
    expect(imageSrc).toBe("https://x.test/other.png")
  })

  test("a non-URL upload handle is not rendered as an image", () => {
    const { imageSrc, text } = renderHeader("4:dGVzdF9pbWFn", [
      { type: "text", text: "Imported" },
    ])
    expect(imageSrc).toBeUndefined()
    expect(text).toContain("Imported")
  })
})
