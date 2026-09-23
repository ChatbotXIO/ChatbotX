import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { StoreApi } from "zustand/vanilla"
import { DashboardPanel } from "../src/components/dashboard-panel"
import {
  type AnalysisStore,
  createAnalysisStore,
  type DashboardLoadStatus,
} from "../src/provider/analysis-store"
import { AnalysisStoreContext } from "../src/provider/analysis-store-context"
import type { AnalyticsApi } from "../src/provider/analytics-api-context"

let container: HTMLDivElement
let root: Root

const messages = {
  actions: { loading: "Loading" },
  states: { error: "Unable to load" },
}

const renderPanel = (
  store: StoreApi<AnalysisStore>,
  status: DashboardLoadStatus | undefined,
  className?: string,
) => {
  store.setState({
    loading: true,
    dashboardLoadStatus: status ? { getContactCounts: status } : {},
  })

  act(() => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AnalysisStoreContext.Provider value={store}>
          <DashboardPanel action="getContactCounts" className={className}>
            <article data-testid="chart">Chart data</article>
          </DashboardPanel>
        </AnalysisStoreContext.Provider>
      </NextIntlClientProvider>,
    )
  })
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe("DashboardPanel", () => {
  test("reveals successful and refreshing charts while global loading remains true", () => {
    const store = createAnalysisStore({
      api: {} as AnalyticsApi,
      type: "contacts",
      defaultSearchParams: { workspaceId: "workspace-1" },
    })

    renderPanel(store, undefined)
    expect(container.querySelector("[data-testid='chart']")).toBeNull()
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull()

    renderPanel(store, "success")
    expect(container.querySelector("[data-testid='chart']")).not.toBeNull()
    expect(store.getState().loading).toBe(true)

    renderPanel(store, "refreshing")
    expect(container.querySelector("[data-testid='chart']")).not.toBeNull()
    expect(container.querySelector("[aria-busy='true']")).toBeNull()
  })

  test("hides failed content and returns to a skeleton for the next load", () => {
    const store = createAnalysisStore({
      api: {} as AnalyticsApi,
      type: "contacts",
      defaultSearchParams: { workspaceId: "workspace-1" },
    })

    renderPanel(store, "error")
    expect(container.textContent).toContain("Unable to load")
    expect(container.querySelector("[data-testid='chart']")).toBeNull()

    renderPanel(store, "queued")
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull()
    expect(container.querySelector("[data-testid='chart']")).toBeNull()
  })

  test("preserves the panel wrapper and grid span in every state", () => {
    const store = createAnalysisStore({
      api: {} as AnalyticsApi,
      type: "conversations",
      defaultSearchParams: { workspaceId: "workspace-1" },
    })

    renderPanel(store, "loading", "w-full md:col-span-2")
    expect(container.firstElementChild?.classList).toContain("md:col-span-2")

    renderPanel(store, "success", "w-full md:col-span-2")
    expect(container.firstElementChild?.classList).toContain("md:col-span-2")
    expect(container.querySelector("[data-testid='chart']")).not.toBeNull()
  })
})
