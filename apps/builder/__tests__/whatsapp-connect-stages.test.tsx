import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useWhatsappConnectStages } from "@/features/integration-whatsapp/hooks/use-whatsapp-connect-stages"
import type { WhatsappConnectOutcome } from "@/features/integration-whatsapp/schema"

const verificationOnlyOutcome: WhatsappConnectOutcome = {
  sourceId: "phone-1",
  name: "phone-1",
  status: "connected",
  integrationId: "integration-1",
  coexistEligible: false,
  extra: {
    requiresPhoneVerification: true,
    registrationError: null,
    displayPhoneNumber: "+1 555 0000",
    verifiedName: "phone-1",
  },
}

const noStageOutcome: WhatsappConnectOutcome = {
  ...verificationOnlyOutcome,
  extra: {
    requiresPhoneVerification: false,
    registrationError: null,
    displayPhoneNumber: "+1 555 0000",
    verifiedName: "phone-1",
  },
}

describe("useWhatsappConnectStages", () => {
  let container: HTMLDivElement
  let root: Root
  let api: ReturnType<typeof useWhatsappConnectStages> | null

  function Harness({ onRedirect }: { onRedirect: (url: string) => void }) {
    api = useWhatsappConnectStages({ onRedirect })
    return null
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    api = null
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("start() redirects immediately (once) when the outcome needs no stage", () => {
    const onRedirect = vi.fn()
    act(() => {
      root.render(
        <StrictMode>
          <Harness onRedirect={onRedirect} />
        </StrictMode>,
      )
    })

    act(() => {
      api?.start({
        outcome: noStageOutcome,
        workspaceId: "ws-1",
        redirectUrl: "/space/ws-1",
      })
    })

    expect(onRedirect).toHaveBeenCalledTimes(1)
    expect(onRedirect).toHaveBeenCalledWith("/space/ws-1")
  })

  test("advance() redirects exactly once under StrictMode's double-invoked updaters, once every stage is exhausted", () => {
    const onRedirect = vi.fn()
    act(() => {
      root.render(
        <StrictMode>
          <Harness onRedirect={onRedirect} />
        </StrictMode>,
      )
    })

    act(() => {
      api?.start({
        outcome: verificationOnlyOutcome,
        workspaceId: "ws-1",
        redirectUrl: "/space/ws-1",
      })
    })
    expect(onRedirect).not.toHaveBeenCalled()
    expect(api?.stage).toBe("verification")

    // A single advance() call — StrictMode double-invokes any function
    // passed to `setState` as an updater to surface impure updaters. If
    // `advance()` still called `onRedirect` from inside such an updater
    // (the pre-fix implementation), this single call would have fired the
    // final redirect twice.
    act(() => {
      api?.advance()
    })

    expect(onRedirect).toHaveBeenCalledTimes(1)
    expect(onRedirect).toHaveBeenCalledWith("/space/ws-1")
  })
})
