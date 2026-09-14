import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import InboxSelectCard from "@/features/inboxes/components/inbox-select-card"

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => navigation.searchParams,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderComponent() {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <InboxSelectCard
        configuredChannels={["telegram"]}
        offeredChannels={["telegram"]}
      />,
    )
  })
}

function selectTelegram(search: string) {
  navigation.searchParams = new URLSearchParams(search)
  navigation.push.mockClear()
  renderComponent()

  act(() => {
    container?.querySelector("button")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    )
  })

  return new URL(`http://localhost${navigation.push.mock.calls[0][0]}`)
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
})

describe("InboxSelectCard channel selection", () => {
  test.each([
    ["preserves workspace context", "workspaceId=workspace-1"],
    ["removes stale errors", "workspaceId=workspace-1&error=workspaceLimitReached"],
    ["replaces existing channel", "workspaceId=workspace-1&channel=messenger"],
    ["works without existing query params", ""],
  ])("%s", (_name, search) => {
    const url = selectTelegram(search)

    expect(url.searchParams.get("channel")).toBe("telegram")
    expect(url.searchParams.getAll("channel")).toHaveLength(1)
    expect(url.searchParams.has("error")).toBe(false)
  })

  test("preserves unrelated query parameters", () => {
    const url = selectTelegram("workspaceId=workspace-1&source=onboarding")

    expect(url.searchParams.get("workspaceId")).toBe("workspace-1")
    expect(url.searchParams.get("source")).toBe("onboarding")
  })
})
