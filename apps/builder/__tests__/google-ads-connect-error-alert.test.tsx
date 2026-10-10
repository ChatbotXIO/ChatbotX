// @vitest-environment jsdom
import { connectErrorQueryCodes } from "@chatbotx.io/utils/connection"
import { act } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  search: "session=300&connect_error=internal_error",
}))

vi.mock("next-intl", async () =>
  (await import("./helpers/google-ads-ui")).nextIntlMock(),
)
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (url: string) => mocks.calls.push(`replace:${url}`),
  }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

import en from "../messages/en.json"
import { click, type Mounted, mount } from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
  mocks.calls.length = 0
  mocks.search = "session=300&connect_error=internal_error"
})
afterEach(() => ui.unmount())

const renderAlert = async (code: string) => {
  const { ConnectErrorAlert } = await import(
    "@/features/integration-google-ads/components/connect-error-alert"
  )
  ui.render(<ConnectErrorAlert code={code as never} workspaceId="ws-1" />)
}

const ERROR_KEY_PREFIX = "googleAds.picker.errors."

describe("ConnectErrorAlert", () => {
  test.each(
    connectErrorQueryCodes.options,
  )("%s renders a visible role=alert with its own translated message", async (code) => {
    await renderAlert(code)
    const alert = ui.container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain("googleAds.picker.connectErrorTitle")
    expect(alert?.textContent).toContain(ERROR_KEY_PREFIX)
  })

  test("each provider-specific code shows a distinct message", async () => {
    const seen = new Set<string>()
    for (const code of [
      "provider_unavailable",
      "developer_token_missing",
      "developer_token_not_approved",
      "project_not_approved",
      "permission_denied",
      "api_not_enabled",
      "credentials_invalid",
    ]) {
      await renderAlert(code)
      seen.add(ui.container.textContent ?? "")
    }
    expect(seen.size).toBe(7)
  })

  test("developer token guidance tells the admin what to check and never includes a token", () => {
    const { errors } = en.googleAds.picker
    expect(errors.developerTokenNotApproved).toContain("administrator")
    expect(errors.developerTokenNotApproved).toContain("optional")
    expect(errors.developerTokenMissing).toContain("administrator")
    expect(errors.developerTokenMissing).not.toContain("token is missing")
  })

  test("project_not_approved guidance names Google Cloud Console access levels", () => {
    const { errors } = en.googleAds.picker
    expect(errors.projectNotApproved).toContain("Google Cloud project")
    expect(errors.projectNotApproved).toContain("Explorer or Basic")
  })

  test("legacy_upload_not_allowed tells the admin to switch to Data Manager and reconnect", () => {
    const { errors } = en.googleAds.picker
    expect(errors.legacyUploadNotAllowed).toContain("Data Manager")
    expect(errors.legacyUploadNotAllowed).toContain("reconnect")
  })

  test("has no retry button: the Connect button on the page is the single way to retry", async () => {
    await renderAlert("internal_error")
    expect(ui.container.textContent).not.toContain("googleAds.picker.tryAgain")
    expect(
      Array.from(ui.container.querySelectorAll("button")).map((b) =>
        b.getAttribute("aria-label"),
      ),
    ).toEqual(["googleAds.picker.dismiss"])
  })

  test("Dismiss hides the alert and removes connect_error from the URL", async () => {
    mocks.search = "connect_error=api_not_enabled"
    await renderAlert("api_not_enabled")
    click(ui.container.querySelector('[aria-label="googleAds.picker.dismiss"]'))
    act(() => undefined)
    expect(ui.container.querySelector('[role="alert"]')).toBeNull()
    expect(mocks.calls).toEqual([
      "replace:/space/ws-1/settings/integrations/google-ads",
    ])
  })

  test("the close button is an icon-only control with an accessible name", async () => {
    await renderAlert("internal_error")
    const close = ui.container.querySelector(
      '[aria-label="googleAds.picker.dismiss"]',
    )
    expect(close?.textContent).toBe("")
    expect(close?.querySelector("svg")).not.toBeNull()
  })

  test.each([
    "developer_token_missing",
    "developer_token_not_approved",
    "api_not_enabled",
    "internal_error",
    "scope_missing",
    "legacy_upload_not_allowed",
  ])("%s shows only the message, with no extra admin hint", async (code) => {
    await renderAlert(code)
    expect(ui.container.textContent).not.toContain("adminHint")
    expect(ui.container.querySelectorAll("p")).toHaveLength(1)
  })

  test("shows one alert with an icon, title and message, and no action row", async () => {
    await renderAlert("provider_error")
    expect(ui.container.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(ui.container.querySelector('[role="alert"] > svg')).not.toBeNull()
    expect(ui.container.querySelectorAll("button")).toHaveLength(1)
  })
})
