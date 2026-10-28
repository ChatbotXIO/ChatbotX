import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/space/1/flows",
}))

const { useRouter } = await import("next/navigation")
const { NavigationPendingBoundary, NavigationPendingProvider } = await import(
  "@/components/navigation-pending"
)

// A navigation that never lands, so the pending state stays observable.
const neverResolves = () => new Promise<void>(() => undefined)

function createRouter(): AppRouterInstance {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    hmrRefresh: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(neverResolves),
    replace: vi.fn(neverResolves),
  } as unknown as AppRouterInstance
}

function PushButton({ href }: { href: string }) {
  const router = useRouter()
  return (
    <button onClick={() => router.push(href)} type="button">
      go
    </button>
  )
}

describe("NavigationPendingProvider", () => {
  let container: HTMLDivElement
  let root: Root
  let router: AppRouterInstance

  const render = (href: string) => {
    act(() => {
      root.render(
        <AppRouterContext.Provider value={router}>
          <NavigationPendingProvider>
            <NavigationPendingBoundary>
              <PushButton href={href} />
            </NavigationPendingBoundary>
          </NavigationPendingProvider>
        </AppRouterContext.Provider>,
      )
    })
  }

  const clickPush = () => {
    act(() => {
      container.querySelector("button")?.click()
    })
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    window.history.replaceState(null, "", "/space/1/flows")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    router = createRouter()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  // Also guards the internal `AppRouterContext` this relies on: if a Next
  // upgrade stops `useRouter()` reading it, the skeleton never appears.
  test("router.push to another page shows the destination skeleton", () => {
    render("/space/1/contacts")
    clickPush()

    expect(router.push).toHaveBeenCalledWith("/space/1/contacts", undefined)
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(container.querySelector("button")?.closest(".hidden")).not.toBeNull()
  })

  test("router.push to the current page keeps it visible", () => {
    render("/space/1/flows?folderId=2")
    clickPush()

    expect(router.push).toHaveBeenCalledWith(
      "/space/1/flows?folderId=2",
      undefined,
    )
    expect(container.querySelector('[role="status"]')).toBeNull()
  })
})
