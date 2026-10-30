// @vitest-environment jsdom

import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toastMock = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMock }))

type UseActionOptions = {
  onError?: (args: { error: { serverError?: string } }) => void
  onSuccess?: (args: { data?: { url?: string } }) => void
}

const useActionMock = vi.hoisted(() => ({
  execute: vi.fn(),
  lastOptions: undefined as UseActionOptions | undefined,
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: UseActionOptions) => {
    useActionMock.lastOptions = options
    return { execute: useActionMock.execute, isPending: false }
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))
vi.mock("@chatbotx.io/ui/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/features/oauth-consent/actions/consent.action", () => ({
  submitOAuthConsentAction: vi.fn(),
}))

const { OAuthConsentForm } = await import(
  "../src/features/oauth-consent/consent-form"
)

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <OAuthConsentForm
        clientName="Inspector"
        oauthQuery="client_id=mcp-client"
        scopes={["openid"]}
        userEmail="owner@example.com"
      />,
    )
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("OAuthConsentForm", () => {
  test("shows a translated fallback when the consent action omits its redirect URI", () => {
    act(() => {
      useActionMock.lastOptions?.onSuccess?.({ data: {} })
    })

    expect(toastMock.error).toHaveBeenCalledWith("failed")
  })

  test("shows the server error when consent submission fails", () => {
    act(() => {
      useActionMock.lastOptions?.onError?.({
        error: { serverError: "Consent code expired" },
      })
    })

    expect(toastMock.error).toHaveBeenCalledWith("Consent code expired")
  })

  test("uses the translated fallback when the action has no server error", () => {
    act(() => {
      useActionMock.lastOptions?.onError?.({ error: {} })
    })

    expect(toastMock.error).toHaveBeenCalledWith("failed")
  })
})
