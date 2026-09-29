import type { TenantSettings } from "@chatbotx.io/business"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ContactNameCell } from "@/features/contacts/components/contact-name-cell"
import { TenantProvider } from "@/features/tenant/tenant-settings-provider"

vi.mock("@chatbotx.io/ui/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <span data-slot="avatar">{children}</span>
  ),
  AvatarImage: ({ alt, src }: { alt: string; src?: string }) =>
    src ? (
      // biome-ignore lint/performance/noImgElement: test double exposes the resolved avatar src
      <img
        alt={alt}
        data-slot="avatar-image"
        height={32}
        src={src}
        width={32}
      />
    ) : null,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-slot="avatar-fallback">{children}</span>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipTrigger: ({ render }: { render: React.ReactNode }) => render,
}))

vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: () => null,
}))

const tenantSettings = {
  storageUrl: "https://filesystem.example.com/chatbotx/",
} as unknown as TenantSettings

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderContact(avatar: string | null) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <TenantProvider settings={tenantSettings}>
        <ContactNameCell
          contact={{ avatar, fullName: "Ada Lovelace" }}
          workspaceId="workspace-1"
        />
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

describe("ContactNameCell avatar rendering", () => {
  test("resolves a raw avatar key against tenant storage", () => {
    const el = renderContact("public/space/1/avatar/contact-1.jpg")

    expect(el.querySelector("img")?.getAttribute("src")).toBe(
      "https://filesystem.example.com/chatbotx/public/space/1/avatar/contact-1.jpg",
    )
  })

  test("renders an absolute avatar proxy URL unchanged", () => {
    const proxyUrl =
      "https://builder.example.com/media/avatar/signed-contact-token"
    const el = renderContact(proxyUrl)

    expect(el.querySelector("img")?.getAttribute("src")).toBe(proxyUrl)
  })

  test("renders initials when the server avatar value is null", () => {
    const el = renderContact(null)

    expect(el.querySelector("img")).toBeNull()
    expect(el.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe(
      "Ad",
    )
  })

  test("renders initials for a no-avatar sentinel instead of a broken image", () => {
    // A sentinel is a "we tried and there is no avatar" marker, not a storage
    // key — it must never be finalized into an <img src>.
    const el = renderContact(`public/img/no_avatar.jpg?time=${Date.now()}`)

    expect(el.querySelector("img")).toBeNull()
    expect(el.querySelector('[data-slot="avatar-fallback"]')?.textContent).toBe(
      "Ad",
    )
  })
})
