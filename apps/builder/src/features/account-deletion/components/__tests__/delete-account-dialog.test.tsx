// @vitest-environment jsdom

import type React from "react"
import { act, isValidElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DeleteAccountDialog } from "../delete-account-dialog"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  onOpenChange: undefined as undefined | ((open: boolean) => void),
  open: false,
  replace: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const translate = (key: string) => key
    translate.rich = (
      _key: string,
      values: { code: (chunks: React.ReactNode) => React.ReactNode },
    ) => values.code("DELETE")

    return translate
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: mocks.execute, isPending: false }),
}))

vi.mock("@/features/account-deletion/actions/request-account-deletion", () => ({
  requestAccountDeletion: {},
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { signOut: mocks.signOut },
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

vi.mock("@chatbotx.io/ui/components/ui/alert", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} type={props.type ?? "button"}>
      {children}
    </button>
  ),
  buttonVariants: () => "",
}))

vi.mock("@chatbotx.io/ui/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({
    children,
    onOpenChange,
    open,
  }: {
    children: React.ReactNode
    onOpenChange: (open: boolean) => void
    open: boolean
  }) => {
    mocks.onOpenChange = onOpenChange
    mocks.open = open

    return (
      <div>
        {children}
        {open ? <div data-testid="dialog" /> : null}
      </div>
    )
  },
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogTrigger: ({ render }: { render: React.ReactNode }) => (
    <button onClick={() => mocks.onOpenChange?.(true)} type="button">
      {isValidElement<{ children?: React.ReactNode }>(render)
        ? render.props.children
        : render}
    </button>
  ),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.open = false
  mocks.onOpenChange = undefined
  mocks.signOut.mockResolvedValue(undefined)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = () => {
  act(() => root.render(<DeleteAccountDialog ownedWorkspaces={[]} />))
}

const buttonWithText = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  )

const requiredButtonWithText = (text: string) => {
  const button = buttonWithText(text)

  if (!button) {
    throw new Error(`Button with text "${text}" is missing`)
  }

  return button
}

const setInputValue = async (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set

  await act(async () => {
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await Promise.resolve()
  })
}

describe("DeleteAccountDialog", () => {
  it("opens when the user selects account deletion", async () => {
    render()

    expect(container.querySelector('[data-testid="dialog"]')).toBeNull()

    await act(async () => {
      requiredButtonWithText("openSettings").click()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="dialog"]')).not.toBeNull()
  })

  it("closes when the user cancels", async () => {
    render()
    await act(async () => {
      requiredButtonWithText("openSettings").click()
      await Promise.resolve()
    })

    await act(async () => {
      requiredButtonWithText("cancel").click()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="dialog"]')).toBeNull()
  })

  it("keeps submit disabled until DELETE is entered", async () => {
    render()
    await act(async () => {
      requiredButtonWithText("openSettings").click()
      await Promise.resolve()
    })

    const submitButton = requiredButtonWithText("submit")
    expect(submitButton.disabled).toBe(true)

    const confirmationInput = container.querySelector<HTMLInputElement>(
      'input[name="confirmation"]',
    )
    if (!confirmationInput) {
      throw new Error("Deletion confirmation input is missing")
    }

    await setInputValue(confirmationInput, "DELETE")

    expect(submitButton?.disabled).toBe(false)
  })
})
