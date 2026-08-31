import type { TenantSettings } from "@chatbotx.io/business"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { AttachmentResource } from "@/features/attachments/schema/resource"
import { MessageItem } from "@/features/messages/components/message-item"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"
import { TenantProvider } from "@/features/tenant/tenant-settings-provider"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// Same rationale as message-item-avatar.test.tsx: MediaLibraryTrigger imports
// "use server" query modules at module scope that drag in a live pg Pool
// under vitest. Stubbing it keeps this test about attachment rendering.
vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: () => null,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

const tenantSettings = {
  storageUrl: "https://cdn.example.com",
} as unknown as TenantSettings

function renderComponent(ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <TenantProvider settings={tenantSettings}>{ui}</TenantProvider>,
    )
  })
  return container
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

const makeMessage = (overrides: Partial<MessageResourceWithRelations> = {}) =>
  ({
    id: "msg-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    messageType: "outgoing",
    type: "message",
    text: null,
    deletedAt: null,
    attributes: null,
    contentAttributes: null,
    attachments: [],
    ...overrides,
  }) as unknown as MessageResourceWithRelations

const makeImageAttachment = (id: string) =>
  ({
    id,
    fileType: "image",
    url: `https://cdn.example.com/${id}.png`,
    name: `${id}.png`,
    originPath: `public/${id}.png`,
    width: 400,
    height: 300,
  }) as unknown as AttachmentResource

const makeFileAttachment = (id: string) =>
  ({
    id,
    fileType: "file",
    url: `https://cdn.example.com/${id}.pdf`,
    name: `${id}.pdf`,
    originPath: `public/${id}.pdf`,
  }) as unknown as AttachmentResource

describe("MessageItem attachment rendering — multiple images", () => {
  test("a single image renders without the grid wrapper", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          attachments: [makeImageAttachment("img-1")],
        })}
      />,
    )

    expect(el.querySelector('[data-slot="attachment-image-grid"]')).toBeNull()
    expect(el.querySelectorAll("img")).toHaveLength(1)
  })

  test("exactly 2 images render a 2-column grid, not a 3-column grid with an empty cell", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          attachments: [
            makeImageAttachment("img-1"),
            makeImageAttachment("img-2"),
          ],
        })}
      />,
    )

    const grid = el.querySelector('[data-slot="attachment-image-grid"]')
    expect(grid).not.toBeNull()
    expect(grid?.className).toContain("grid-cols-2")
    expect(grid?.className).not.toContain("grid-cols-3")
    expect(grid?.querySelectorAll("img")).toHaveLength(2)
  })

  test("multiple images render inside a 3-column grid", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          attachments: [
            makeImageAttachment("img-1"),
            makeImageAttachment("img-2"),
            makeImageAttachment("img-3"),
          ],
        })}
      />,
    )

    const grid = el.querySelector('[data-slot="attachment-image-grid"]')
    expect(grid).not.toBeNull()
    expect(grid?.className).toContain("grid-cols-3")
    expect(grid?.querySelectorAll("img")).toHaveLength(3)
  })

  test("non-image attachments stay outside the image grid", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          attachments: [
            makeImageAttachment("img-1"),
            makeImageAttachment("img-2"),
            makeFileAttachment("file-1"),
          ],
        })}
      />,
    )

    const grid = el.querySelector('[data-slot="attachment-image-grid"]')
    expect(grid?.querySelectorAll("img")).toHaveLength(2)
    expect(el.textContent).toContain("file-1.pdf")
  })
})
