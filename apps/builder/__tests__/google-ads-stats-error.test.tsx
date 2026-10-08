// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isPending: false,
}))

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useTransition: () => [mocks.isPending, (callback: () => void) => callback()],
}))
vi.mock("next-intl", async () =>
  (await import("./helpers/google-ads-ui")).nextIntlMock(),
)
vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "ws-1" }),
}))

import GoogleAdsStatsError from "../src/app/space/[workspaceId]/dashboard/ads/google/error"
import {
  buttonByText,
  click,
  type Mounted,
  mount,
} from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
  mocks.isPending = false
})
afterEach(() => ui.unmount())

describe("Google Ads statistics error view", () => {
  test("announces the failure and offers a way back to the dashboard", () => {
    ui.render(<GoogleAdsStatsError retry={vi.fn()} />)

    expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain(
      "googleAds.stats.error.title",
    )
    expect(
      ui.container.querySelector('a[href="/space/ws-1/dashboard/contacts"]')
        ?.textContent,
    ).toBe("fields.analytics.label")
  })

  test("retry calls the retry prop from Next", () => {
    const retry = vi.fn()
    ui.render(<GoogleAdsStatsError retry={retry} />)

    click(buttonByText(ui.container, "googleAds.stats.error.retry"))

    expect(retry).toHaveBeenCalledTimes(1)
  })

  test("the retry button is disabled while the retry is in flight", () => {
    mocks.isPending = true
    ui.render(<GoogleAdsStatsError retry={vi.fn()} />)

    expect(
      buttonByText(ui.container, "googleAds.stats.error.retry")?.disabled,
    ).toBe(true)
  })
})
