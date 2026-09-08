import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WhatsappOnboardingResult } from "@/features/integration-whatsapp/components/whatsapp-onboarding-result"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="link">{children}</span>
  ),
}))

vi.mock("@/hooks/use-clipboard", () => ({
  useClipboard: () => ({ handleCopy: vi.fn() }),
}))

const results = [
  {
    integrationId: "int-1",
    workspaceId: "ws-1",
    webhookUrl: "https://broker.test/webhook",
    verifyToken: "verify-token-1",
  },
]

/**
 * The manual-result step ends the dialog, so its own button has to obey the
 * same rule the dialog footer does: navigation is not instant, and a second
 * click must not fire a second redirect.
 */
describe("WhatsappOnboardingResult — the step's own Done button", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
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

  const doneButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("whatsapp.manualOnboarding.goToInbox"),
    )

  test("is live until the dialog says it is leaving", () => {
    const onDone = vi.fn()
    act(() => {
      root.render(
        <WhatsappOnboardingResult onDone={onDone} results={results} />,
      )
    })

    expect(doneButton()?.disabled).toBe(false)
    act(() => {
      doneButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test("is disabled once the dialog is leaving", () => {
    const onDone = vi.fn()
    act(() => {
      root.render(
        <WhatsappOnboardingResult isDone onDone={onDone} results={results} />,
      )
    })

    expect(doneButton()?.disabled).toBe(true)
  })
})
