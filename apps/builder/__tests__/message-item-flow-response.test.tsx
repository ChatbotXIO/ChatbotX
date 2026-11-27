import type { TenantSettings } from "@chatbotx.io/business"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { MessageItem } from "@/features/messages/components/message-item"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"
import { TenantProvider } from "@/features/tenant/tenant-settings-provider"

/** Echoes the key (and a count) back so assertions never depend on the copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
  useLocale: () => "en",
}))

vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: () => null,
}))

vi.mock("@/features/messages/components/whatsapp-call-card", () => ({
  WhatsappCallCard: () => null,
}))

// The dialog loads answers through oRPC; only its trigger matters here.
vi.mock("@/features/messages/components/whatsapp-flow-response-dialog", () => ({
  WhatsappFlowResponseButton: () => (
    <button data-testid="view-response" type="button">
      viewResponse
    </button>
  ),
}))

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt={alt} height={1} src={src} width={1} />
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

const tenantSettings = {
  storageUrl: "https://cdn.example.com",
} as unknown as TenantSettings

const renderItem = (
  message: MessageResourceWithRelations,
  props: { guestDisplay?: boolean } = {},
) => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <TenantProvider settings={tenantSettings}>
        <MessageItem message={message} {...props} />
      </TenantProvider>,
    )
  })
  return container
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
})

const attachment = (
  id: string,
  fields: { fileType: "image" | "file"; name: string; mimeType: string },
) => ({
  id,
  fileType: fields.fileType,
  name: fields.name,
  mimeType: fields.mimeType,
  size: 2048,
  width: null,
  height: null,
  originPath: `public/whatsapp/ws-1/int-1/2026/11/04/${id}.bin`,
  url: `https://cdn.example.com/${id}`,
  fallbackUrl: null,
})

const flowResponseMessage = (
  overrides: Partial<MessageResourceWithRelations> = {},
) =>
  ({
    id: "msg-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    createdAt: new Date("2026-11-04T00:00:00Z"),
    messageType: "incoming",
    type: "message",
    text: "Sent",
    deletedAt: null,
    attributes: null,
    contentAttributes: {
      type: "whatsapp_flow_response",
      name: "flow",
      flowResponse: {},
      flowToken: null,
      decoded: null,
      files: {
        photos: [
          {
            status: "stored",
            mediaId: "1",
            fileName: "front.png",
            mimeType: "image/png",
            size: 2048,
          },
          {
            status: "stored",
            mediaId: "2",
            fileName: "back.png",
            mimeType: "image/png",
            size: 2048,
          },
        ],
        docs: [
          {
            status: "stored",
            mediaId: "3",
            fileName: "receipt.pdf",
            mimeType: "application/pdf",
            size: 2048,
          },
          {
            status: "failed",
            mediaId: "4",
            fileName: "old.pdf",
            mimeType: "application/pdf",
            reason: "download_failed",
          },
        ],
      },
    },
    attachments: [
      attachment("a1", {
        fileType: "image",
        name: "front.png",
        mimeType: "image/png",
      }),
      attachment("a2", {
        fileType: "image",
        name: "back.png",
        mimeType: "image/png",
      }),
      attachment("a3", {
        fileType: "file",
        name: "receipt.pdf",
        mimeType: "application/pdf",
      }),
    ],
    ...overrides,
  }) as unknown as MessageResourceWithRelations

const card = (root: HTMLElement) =>
  root.querySelector('[data-slot="whatsapp-flow-response-card"]')

describe("a WhatsApp Flow response in the inbox", () => {
  test("is one card holding the text, the files and the answers", () => {
    const view = renderItem(flowResponseMessage())
    const flowCard = card(view)

    expect(flowCard).not.toBeNull()
    expect(flowCard?.textContent).toContain("title")
    expect(flowCard?.textContent).toContain("Sent")
    expect(
      Array.from(flowCard?.querySelectorAll("img") ?? [], (img) =>
        img.getAttribute("src"),
      ),
    ).toEqual(["https://cdn.example.com/a1", "https://cdn.example.com/a2"])
    expect(
      flowCard?.querySelector('[data-testid="view-response"]'),
    ).not.toBeNull()
    // The text is not repeated outside the card.
    expect(view.textContent?.match(/Sent/g)).toHaveLength(1)
  })

  test("previews files without listing them: no links, no URLs, a count", () => {
    const view = renderItem(flowResponseMessage())
    const flowCard = card(view)

    expect(flowCard?.querySelector("a")).toBeNull()
    expect(flowCard?.textContent).not.toContain("receipt.pdf")
    expect(view.textContent).not.toContain("https://cdn.example.com")
    expect(flowCard?.textContent).toContain("filesAttached:3")
  })

  test("shows at most four photos and how many more there are", () => {
    const photos = Array.from({ length: 6 }, (_, index) =>
      attachment(`p${index}`, {
        fileType: "image",
        name: `p${index}.png`,
        mimeType: "image/png",
      }),
    )
    const view = renderItem(
      flowResponseMessage({
        attachments: photos,
      } as unknown as Partial<MessageResourceWithRelations>),
    )

    expect(card(view)?.querySelectorAll("img")).toHaveLength(4)
    expect(card(view)?.textContent).toContain("+2")
  })

  test("loads no thumbnail for a big photo or one browsers cannot draw", () => {
    const view = renderItem(
      flowResponseMessage({
        attachments: [
          {
            ...attachment("big", {
              fileType: "image",
              name: "big.png",
              mimeType: "image/png",
            }),
            size: 3 * 1024 * 1024,
          },
          attachment("heic", {
            fileType: "image",
            name: "photo.heic",
            mimeType: "image/heic",
          }),
        ],
      } as unknown as Partial<MessageResourceWithRelations>),
    )

    expect(card(view)?.querySelectorAll("img")).toHaveLength(0)
    expect(card(view)?.textContent).toContain("filesAttached:2")
  })

  test("counts the files that could not be kept", () => {
    const view = renderItem(flowResponseMessage())

    expect(card(view)?.textContent).toContain("filesNotSaved:1")
  })

  test("says nothing about unsaved files when every file was kept", () => {
    const view = renderItem(
      flowResponseMessage({
        contentAttributes: {
          type: "whatsapp_flow_response",
          flowResponse: {},
          flowToken: null,
          decoded: null,
        },
      } as Partial<MessageResourceWithRelations>),
    )

    expect(card(view)?.textContent).not.toContain("filesNotSaved")
  })

  test("the guest widget keeps the plain message, without the agent-only card", () => {
    const view = renderItem(flowResponseMessage(), { guestDisplay: true })

    expect(card(view)).toBeNull()
    expect(view.querySelector('[data-testid="view-response"]')).toBeNull()
    expect(view.textContent).toContain("Sent")
  })

  test("a deleted response shows no card", () => {
    const view = renderItem(
      flowResponseMessage({ deletedAt: new Date("2026-11-04T01:00:00Z") }),
    )

    expect(card(view)).toBeNull()
    expect(view.textContent).toContain("messageDeleted")
  })
})

describe("the card's counts with a real catalog", () => {
  // Every catalog keeps English's `one`/`other` branches (i18n-messages test);
  // Arabic's other plural categories fall back to `other`.
  test.each([
    [1, "لم يتم حفظ 1 ملف"],
    [2, "لم يتم حفظ 2 ملفات"],
    [11, "لم يتم حفظ 11 ملفات"],
  ])("Arabic, %i not saved", async (count, expected) => {
    const { createTranslator } =
      await vi.importActual<typeof import("next-intl")>("next-intl")
    const messages = (await import("../messages/ar.json")).default
    const t = createTranslator({
      locale: "ar",
      messages,
      namespace: "messages.flowResponse",
    })

    expect(t("filesNotSaved", { count })).toBe(expected)
  })
})
