import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { WhatsappConnectOutcome } from "@/features/integration-whatsapp/schema"
import { WhatsappPhoneVerificationQueue } from "@/features/integration-whatsapp/verification/whatsapp-phone-verification-queue"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

type LoggedPanelProps = {
  displayPhoneNumber?: string
  integrationId: string
  onSkip?: () => void
  onVerified?: () => void
  registrationError?: unknown
  verifiedName?: string
  workspaceId: string
}

let panelCalls: LoggedPanelProps[] = []

vi.mock(
  "@/features/integration-whatsapp/verification/whatsapp-phone-verification-panel",
  () => ({
    WhatsappPhoneVerificationPanel: (props: LoggedPanelProps) => {
      panelCalls.push(props)
      return (
        <div data-integration-id={props.integrationId} data-testid="panel" />
      )
    },
  }),
)

function outcome(id: string): WhatsappConnectOutcome {
  return {
    sourceId: id,
    name: `Number ${id}`,
    status: "connected",
    integrationId: id,
    coexistEligible: false,
    extra: {
      requiresPhoneVerification: true,
      registrationError: null,
      displayPhoneNumber: `+1 555 ${id}`,
      verifiedName: `Verified ${id}`,
    },
  }
}

describe("WhatsappPhoneVerificationQueue", () => {
  let container: HTMLDivElement
  let root: Root
  let onDone: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    panelCalls = []
    onDone = vi.fn<() => void>()
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

  const render = (rows: WhatsappConnectOutcome[]) => {
    act(() => {
      root.render(
        <WhatsappPhoneVerificationQueue
          onDone={onDone}
          rows={rows}
          workspaceId="ws-1"
        />,
      )
    })
  }

  const currentPanel = () => panelCalls.at(-1)
  const verifyCurrent = () => {
    act(() => {
      currentPanel()?.onVerified?.()
    })
  }

  test("shows the first row's panel with only its documented props", () => {
    render([outcome("phone-1"), outcome("phone-2")])

    expect(panelCalls).toHaveLength(1)
    const props = currentPanel()
    expect(Object.keys(props ?? {}).sort()).toEqual(
      [
        "displayPhoneNumber",
        "integrationId",
        "onSkip",
        "onVerified",
        "registrationError",
        "verifiedName",
        "workspaceId",
      ].sort(),
    )
    expect(props?.integrationId).toBe("phone-1")
    expect(props?.workspaceId).toBe("ws-1")
    expect(props?.displayPhoneNumber).toBe("+1 555 phone-1")
    expect(props?.verifiedName).toBe("Verified phone-1")
    expect(props?.registrationError).toBeNull()
  })

  test("shows the progress label", () => {
    render([outcome("phone-1"), outcome("phone-2"), outcome("phone-3")])

    expect(container.textContent).toContain(
      'whatsapp.phoneVerification.queueProgress:{"current":1,"total":3}',
    )
  })

  test("advances to the next row once the current one is verified", () => {
    render([outcome("phone-1"), outcome("phone-2")])

    verifyCurrent()

    expect(panelCalls).toHaveLength(2)
    expect(currentPanel()?.integrationId).toBe("phone-2")
    expect(container.textContent).toContain(
      'whatsapp.phoneVerification.queueProgress:{"current":2,"total":2}',
    )
    expect(onDone).not.toHaveBeenCalled()
  })

  test("calls onDone exactly once after the last row is verified", () => {
    render([outcome("phone-1"), outcome("phone-2")])

    verifyCurrent()
    verifyCurrent()

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  const skipCurrent = () => {
    act(() => {
      currentPanel()?.onSkip?.()
    })
  }

  test("skipping a middle row moves on without calling onDone", () => {
    render([outcome("phone-1"), outcome("phone-2")])

    skipCurrent()

    expect(currentPanel()?.integrationId).toBe("phone-2")
    expect(container.textContent).toContain(
      'whatsapp.phoneVerification.queueProgress:{"current":2,"total":2}',
    )
    expect(onDone).not.toHaveBeenCalled()
  })

  test("skipping the last row finishes the queue exactly once", () => {
    render([outcome("phone-1"), outcome("phone-2")])

    verifyCurrent()
    skipCurrent()

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test("a single-row queue can be skipped and finishes exactly once", () => {
    render([outcome("phone-1")])

    skipCurrent()

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  test("a single-row queue calls onDone after that one row", () => {
    render([outcome("phone-1")])

    verifyCurrent()

    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
