import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { mockMessengerPages } = vi.hoisted(() => ({
  mockMessengerPages: vi.fn((_props: { items: unknown[] }) => null),
}))

// The picker list is unit-tested in `messenger-pages.test.tsx`; here it is a
// capture stub so this file can assert what `SelectPage` hands it.
vi.mock("@/features/integration-messenger/components/messenger-pages", () => ({
  MessengerPages: mockMessengerPages,
}))

const { SelectPage } = await import(
  "@/features/integration-messenger/components/select-account"
)

describe("SelectPage", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  const readErrorBox = () => container.querySelector('[role="alert"]')

  test("shows Meta's own sentence in a box when the page list failed with a Graph error", async () => {
    await act(() => {
      root.render(
        <SelectPage
          bmLookupFailed={false}
          items={[]}
          loadError={{
            providerMessage:
              "(#1) Please reduce the amount of data you're asking for",
          }}
          workspaceId="ws-1"
        />,
      )
    })

    expect(readErrorBox()?.textContent).toContain(
      "(#1) Please reduce the amount of data you're asking for",
    )
    // The picker still renders, empty, so its own "No Facebook Pages found"
    // state is what the operator sees under the box.
    expect(mockMessengerPages).toHaveBeenCalledWith(
      expect.objectContaining({ items: [] }),
      undefined,
    )
  })

  test("shows the generic copy when the failure carried no Graph message", async () => {
    await act(() => {
      root.render(
        <SelectPage
          bmLookupFailed={false}
          items={[]}
          loadError={{}}
          workspaceId="ws-1"
        />,
      )
    })

    expect(readErrorBox()?.textContent).toContain(
      "messenger.selectPage.loadFailed",
    )
  })

  test("renders no error box when the page list loaded", async () => {
    await act(() => {
      root.render(
        <SelectPage bmLookupFailed={false} items={[]} workspaceId="ws-1" />,
      )
    })

    expect(readErrorBox()).toBeNull()
  })
})
