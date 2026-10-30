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
  onSuccess?: (args: { data?: { redirectURI?: string } }) => void
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
vi.mock("@chatbotx.io/ui/components/ui/label", () => ({
  Label: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))
vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}))
vi.mock("@/features/oauth-consent/actions/consent.action", () => ({
  submitOAuthConsentAction: vi.fn(),
}))

const { OAuthConsentForm } = await import(
  "../src/features/oauth-consent/consent-form"
)

let container: HTMLDivElement
let root: Root

// A fresh root per render, so the preselected workspace state is not
// carried over from an earlier render.
const renderForm = (workspaces: { id: string; name: string }[]) => {
  act(() => root.unmount())
  root = createRoot(container)
  act(() => {
    root.render(
      <OAuthConsentForm
        clientId="client-1"
        clientName="Inspector"
        consentCode="consent-code"
        scopes={["openid"]}
        userEmail="owner@example.com"
        workspaces={workspaces}
      />,
    )
  })
}

const findButton = (label: string) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent === label,
  )
  if (!button) {
    throw new Error(`Button ${label} not found`)
  }
  return button
}

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  renderForm([{ id: "ws-1", name: "Alpha" }])
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("OAuthConsentForm", () => {
  test("preselects the only workspace and approves with it", () => {
    act(() => findButton("approve").click())

    expect(useActionMock.execute).toHaveBeenCalledWith({
      accept: true,
      clientId: "client-1",
      consentCode: "consent-code",
      workspaceId: "ws-1",
    })
  })

  test("requires a workspace choice before approving when several are available", () => {
    renderForm([
      { id: "ws-1", name: "Alpha" },
      { id: "ws-2", name: "Beta" },
    ])

    expect(findButton("approve").disabled).toBe(true)
    expect(container.textContent).toContain("Beta")
  })

  test("denies without a workspace", () => {
    act(() => findButton("deny").click())

    expect(useActionMock.execute).toHaveBeenCalledWith({
      accept: false,
      clientId: "client-1",
      consentCode: "consent-code",
    })
  })

  test("blocks approval and explains when the user administers no workspace", () => {
    renderForm([])

    expect(findButton("approve").disabled).toBe(true)
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "noWorkspaces",
    )
  })

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
