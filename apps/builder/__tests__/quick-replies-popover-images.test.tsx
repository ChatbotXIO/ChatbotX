import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "ws-1" }),
}))

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span data-image={alt} />,
}))

const savedReply = {
  id: "1",
  workspaceId: "ws-1",
  shortcut: "product",
  text: "Our product",
  createdAt: new Date(),
  updatedAt: new Date(),
  images: [
    {
      id: "img-1",
      mediaLibraryFileId: "f1",
      name: "a.png",
      mimeType: "image/png",
      size: 1,
      url: "https://cdn/a.png",
    },
  ],
}

vi.mock("@/features/saved-replies/provider/saved-reply-hook", () => ({
  useSavedReplies: () => ({ data: [savedReply], isLoading: false }),
}))

const { QuickRepliesPopover } = await import(
  "@/features/saved-replies/quick-replies-popover"
)

let container: HTMLDivElement | null = null
let root: Root | null = null

const renderPopover = (props: {
  imageLimit?: number
  onSelect: (reply: typeof savedReply) => void
}) => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <QuickRepliesPopover
        imageLimit={props.imageLimit}
        inputValue="/prod"
        onSelect={props.onSelect}
      >
        <textarea defaultValue="/prod" />
      </QuickRepliesPopover>,
    )
  })
  return container.querySelector("textarea") as HTMLTextAreaElement
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
})

describe("QuickRepliesPopover with images", () => {
  test("warns when the conversation can't send the reply's images", () => {
    renderPopover({ imageLimit: 0, onSelect: vi.fn() })

    expect(document.body.textContent).toContain(
      "messages.savedReplyImagesNotSentHere",
    )
  })

  test("shows no warning when the images fit", () => {
    renderPopover({ imageLimit: 10, onSelect: vi.fn() })

    expect(document.body.textContent).not.toContain(
      "messages.savedReplyImagesNotSentHere",
    )
  })

  test("hands the whole saved reply, images included, to onSelect", () => {
    const onSelect = vi.fn()
    const textarea = renderPopover({ imageLimit: 10, onSelect })

    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      )
    })

    expect(onSelect).toHaveBeenCalledWith(savedReply)
  })
})
