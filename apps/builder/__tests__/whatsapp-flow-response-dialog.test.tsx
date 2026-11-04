// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const fetchFlowResponse = vi.hoisted(() => vi.fn())

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    messagesAPI: {
      getWhatsappFlowResponseAuthenticatedAPI: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["flow-response", input],
          queryFn: () => fetchFlowResponse(input),
          retry: false,
        }),
      },
    },
  },
}))

// The real dialog portals through Base UI; rendering its children inline
// keeps the assertions on what the dialog shows, not how it mounts.
vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}))

const { WhatsappFlowResponseButton } = await import(
  "@/features/messages/components/whatsapp-flow-response-dialog"
)

let container: HTMLDivElement
let root: Root

const props = {
  workspaceId: "ws-1",
  conversationId: "conv-1",
  messageId: "msg-1",
  createdAt: "2026-10-01T00:00:00.000Z",
}

/** Lets React Query settle until `text` shows (or fails after ~1s). */
const waitForText = async (text: string) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (container.textContent?.includes(text)) {
      return
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  throw new Error(`"${text}" never showed; got: ${container.textContent}`)
}

const render = () => {
  const queryClient = new QueryClient()
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <WhatsappFlowResponseButton {...props} />
      </QueryClientProvider>,
    )
  })
}

const clickButton = (text: string) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.includes(text),
  )
  if (!button) {
    throw new Error(`No button "${text}"`)
  }
  act(() => {
    button.click()
  })
}

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  fetchFlowResponse.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("WhatsappFlowResponseButton", () => {
  test("loads nothing until the dialog opens", () => {
    render()

    expect(container.textContent).toContain(
      "messages.flowResponse.viewResponse",
    )
    expect(container.querySelector("[role=dialog]")).toBeNull()
    expect(fetchFlowResponse).not.toHaveBeenCalled()
  })

  test("shows each answer under its question", async () => {
    fetchFlowResponse.mockResolvedValue({
      labelSource: "whatsappFlow",
      fields: [
        { key: "name", label: "Full name", kind: "text", value: "An" },
        { key: "agree", label: "Agree", kind: "boolean", value: true },
        { key: "plans", label: "Plans", kind: "list", value: ["Basic", "Pro"] },
        {
          key: "photos",
          label: "Photos",
          kind: "files",
          value: [
            {
              status: "unprocessed",
              fileName: "IMG_1.jpg",
              mimeType: null,
              mediaId: null,
            },
          ],
        },
        { key: "note", label: "Note", kind: "text", value: "" },
      ],
    })
    render()

    clickButton("messages.flowResponse.viewResponse")
    await waitForText("Full name")

    expect(fetchFlowResponse).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      createdAt: new Date(props.createdAt),
    })
    const terms = Array.from(container.querySelectorAll("dt")).map(
      (term) => term.textContent,
    )
    const values = Array.from(container.querySelectorAll("dd")).map(
      (value) => value.textContent,
    )
    expect(terms).toEqual(["Full name", "Agree", "Plans", "Photos", "Note"])
    expect(values).toEqual([
      "An",
      "messages.flowResponse.yes",
      "BasicPro",
      "IMG_1.jpgmessages.flowResponse.fileNotSaved",
      "messages.flowResponse.noAnswer",
    ])
    expect(container.textContent).not.toContain(
      "messages.flowResponse.labelsUnavailable",
    )
  })

  describe("uploaded files", () => {
    const showFiles = async (value: unknown[]): Promise<Element | null> => {
      fetchFlowResponse.mockResolvedValue({
        labelSource: "whatsappFlow",
        fields: [{ key: "docs", label: "Documents", kind: "files", value }],
      })
      render()
      clickButton("messages.flowResponse.viewResponse")
      await waitForText("Documents")
      return container.querySelector("dd ul")
    }

    test("a stored file is a link that opens in a new tab, with its size", async () => {
      const list = await showFiles([
        {
          status: "stored",
          fileName: "Boarding Pass.pdf",
          mimeType: "application/pdf",
          mediaId: "1",
          size: 2_621_440,
          url: "https://files.example/1-pass.pdf",
        },
      ])

      const link = list?.querySelector("a")
      expect(link?.getAttribute("href")).toBe(
        "https://files.example/1-pass.pdf",
      )
      expect(link?.getAttribute("target")).toBe("_blank")
      expect(link?.getAttribute("rel")).toBe("noopener noreferrer")
      expect(link?.textContent).toContain("Boarding Pass.pdf")
      expect(link?.textContent).toContain("2.5")
      expect(link?.querySelector("img")).toBeNull()
    })

    test("a stored image shows a thumbnail", async () => {
      const list = await showFiles([
        {
          status: "stored",
          fileName: "receipt.png",
          mimeType: "image/png",
          mediaId: "2",
          size: 900,
          url: "https://files.example/2-receipt.png",
        },
      ])

      expect(list?.querySelector("a img")?.getAttribute("alt")).toBe("")
      expect(list?.textContent).toContain("900")
    })

    test.each([
      ["a type browsers cannot draw", "image/heic", 900],
      ["a large photo", "image/jpeg", 5 * 1024 * 1024],
    ])("%s gets an icon, not a thumbnail", async (_label, mimeType, size) => {
      const list = await showFiles([
        {
          status: "stored",
          fileName: "photo",
          mimeType,
          mediaId: "4",
          size,
          url: "https://files.example/photo",
        },
      ])

      expect(list?.querySelector("a")?.getAttribute("href")).toBe(
        "https://files.example/photo",
      )
      expect(list?.querySelector("img")).toBeNull()
    })

    test("a file that could not be kept says why, without a link", async () => {
      const list = await showFiles([
        {
          status: "failed",
          fileName: "scan.pdf",
          mimeType: null,
          mediaId: "3",
          failureReason: "download_failed",
        },
      ])

      expect(list?.querySelector("a")).toBeNull()
      expect(list?.textContent).toContain("scan.pdf")
      expect(list?.textContent).toContain(
        "messages.flowResponse.fileFailure.download_failed",
      )
    })

    test("lists every file of an answer in order", async () => {
      const list = await showFiles([
        {
          status: "stored",
          fileName: "a.pdf",
          mimeType: "application/pdf",
          mediaId: "1",
          size: 10,
          url: "https://files.example/a.pdf",
        },
        {
          status: "failed",
          fileName: "b.pdf",
          mimeType: null,
          mediaId: "2",
          failureReason: "too_large",
        },
      ])

      expect(
        Array.from(list?.querySelectorAll("li") ?? []).map((item) =>
          item.textContent?.includes("a.pdf") ? "a" : "b",
        ),
      ).toEqual(["a", "b"])
    })
  })

  test("notes when labels are humanized keys", async () => {
    fetchFlowResponse.mockResolvedValue({
      labelSource: "fallback",
      fields: [{ key: "a", label: "A", kind: "text", value: "x" }],
    })
    render()

    clickButton("messages.flowResponse.viewResponse")
    await waitForText("messages.flowResponse.labelsUnavailable")

    expect(container.textContent).toContain(
      "messages.flowResponse.labelsUnavailable",
    )
  })

  test("shows the empty state for a response with no answers", async () => {
    fetchFlowResponse.mockResolvedValue({ labelSource: "fallback", fields: [] })
    render()

    clickButton("messages.flowResponse.viewResponse")
    await waitForText("messages.flowResponse.empty")

    expect(container.textContent).toContain("messages.flowResponse.empty")
  })

  test("offers a retry when loading fails", async () => {
    fetchFlowResponse
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        labelSource: "whatsappFlow",
        fields: [{ key: "a", label: "Answer", kind: "text", value: "ok" }],
      })
    render()

    clickButton("messages.flowResponse.viewResponse")
    await waitForText("messages.flowResponse.failed")
    expect(container.textContent).toContain("messages.flowResponse.failed")

    clickButton("actions.retry")
    await waitForText("Answer")

    expect(fetchFlowResponse).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain("Answer")
  })
})
