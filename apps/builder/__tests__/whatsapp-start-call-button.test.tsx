import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { StartCallButton } from "@/features/integration-whatsapp/calling/softphone/start-call-button"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock(
  "@/features/integration-whatsapp/calling/actions/start-call.action",
  () => ({ startWhatsappCallAction: vi.fn() }),
)

vi.mock(
  "@/features/integration-whatsapp/calling/actions/softphone-credentials.action",
  () => ({ getSoftphoneCredentialsAction: vi.fn() }),
)

describe("StartCallButton", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("renders nothing when mounted outside a SipUserProvider", () => {
    act(() => {
      root.render(
        <StartCallButton conversationId="conv-1" sipCallingAvailable={true} />,
      )
    })
    expect(container.textContent).toBe("")
    expect(container.querySelector("button")).toBeNull()
  })

  test("renders nothing when calling is unavailable, provider or not", () => {
    act(() => {
      root.render(
        <StartCallButton conversationId="conv-1" sipCallingAvailable={false} />,
      )
    })
    expect(container.querySelector("button")).toBeNull()
  })
})
