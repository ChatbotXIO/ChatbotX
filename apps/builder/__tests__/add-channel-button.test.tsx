import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { AddChannelButton } from "@/features/inboxes/components/add-channel-button"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// Base UI's Tooltip only mounts its popup into the DOM once actually opened
// (hover/focus), which a unit test shouldn't have to drive. Mock the
// primitives down to plain markup so this test stays about
// AddChannelButton's own branching, not Base UI's open/portal behavior.
vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ render }: { render: React.ReactNode }) => render,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderComponent(ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
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

describe("AddChannelButton", () => {
  test("defaults canCreate to true and renders a live link when omitted", () => {
    const el = renderComponent(
      <AddChannelButton
        href="/channels/create?channel=zalo&workspaceId=ws-1"
        label="Zalo"
      />,
    )

    const link = el.querySelector("a")
    expect(link).not.toBeNull()
    expect(link?.getAttribute("href")).toBe(
      "/channels/create?channel=zalo&workspaceId=ws-1",
    )
    expect(el.querySelector("button[disabled]")).toBeNull()
  })

  test("canCreate=false drops the anchor entirely and renders a disabled button", () => {
    const el = renderComponent(
      <AddChannelButton
        canCreate={false}
        href="/channels/create?channel=zalo&workspaceId=ws-1"
        label="Zalo"
      />,
    )

    expect(el.querySelector("a")).toBeNull()
    const button = el.querySelector("button")
    expect(button).not.toBeNull()
    expect(button?.disabled).toBe(true)
  })

  test("canCreate=false shows the platform-hidden tooltip content", () => {
    const el = renderComponent(
      <AddChannelButton canCreate={false} label="Zalo" />,
    )

    expect(
      el.querySelector('[data-testid="tooltip-content"]')?.textContent,
    ).toBe("platformChannels.hiddenByPlatform")
  })

  test("canCreate=false discards a supplied render element instead of mounting it", () => {
    const el = renderComponent(
      <AddChannelButton
        canCreate={false}
        label="Telegram"
        render={<div data-testid="dialog-trigger">open dialog</div>}
      />,
    )

    expect(el.querySelector('[data-testid="dialog-trigger"]')).toBeNull()
  })

  test("canCreate=true with render renders the supplied element as-is", () => {
    const el = renderComponent(
      <AddChannelButton
        canCreate={true}
        label="Telegram"
        render={<div data-testid="dialog-trigger">open dialog</div>}
      />,
    )

    expect(el.querySelector('[data-testid="dialog-trigger"]')).not.toBeNull()
  })
})
