// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

const copyToClipboard = vi.fn(async () => true)
vi.mock("usehooks-ts", () => ({
  useCopyToClipboard: () => [null, copyToClipboard],
}))

vi.mock("../actions/update-workspace-token-action", () => ({
  updateWorkspaceTokenAction: { bind: () => vi.fn() },
}))

type ActionProps = {
  onSuccess?: (payload: unknown) => void
  onError?: (payload: { error: { serverError?: string } }) => void
}

let capturedActionProps: ActionProps = {}

// Real react-hook-form behind the adapter so watch/setValue/placeholder
// behavior is genuinely exercised; only the server-action wiring is stubbed,
// with the success/error callbacks captured for direct invocation.
vi.mock("@next-safe-action/adapter-react-hook-form/hooks", async () => {
  const { useForm } = await import("react-hook-form")
  return {
    useHookFormAction: (
      _action: unknown,
      _resolver: unknown,
      options: {
        actionProps: ActionProps
        formProps: Parameters<typeof useForm>[0]
      },
    ) => {
      capturedActionProps = options.actionProps
      const form = useForm(options.formProps)
      return {
        form,
        handleSubmitWithAction: (event?: { preventDefault?: () => void }) =>
          event?.preventDefault?.(),
      }
    },
  }
})

const WORKSPACE_ID = "ws-123"
// `${workspaceId}.` + 43 base64url chars from randomUrlSafeString(32).
const GENERATED_TOKEN_PATTERN = /^ws-123\.[A-Za-z0-9_-]{43}$/

describe("ManageAccessTokenPage", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    capturedActionProps = {}
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(hasToken: boolean) {
    const { default: ManageAccessTokenPage } = await import(
      "../manage-access-token"
    )
    act(() => {
      root.render(
        <ManageAccessTokenPage
          hasToken={hasToken}
          workspaceId={WORKSPACE_ID}
        />,
      )
    })
  }

  const tokenInput = () =>
    container.querySelector<HTMLInputElement>('input[name="token"]')

  const buttonByText = (text: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === text,
    )

  // The copy button is the only icon-only (textless) button.
  const copyButton = () =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "",
    )

  const clickGenerate = async () => {
    await act(() => {
      buttonByText("actions.generate")?.click()
    })
  }

  it("starts empty with copy disabled and no mask when no token is stored", async () => {
    await render(false)

    expect(tokenInput()?.value).toBe("")
    expect(tokenInput()?.placeholder).toBe("")
    expect(copyButton()?.disabled).toBe(true)
    expect(buttonByText("actions.generate")).toBeDefined()
  })

  it("shows only a mask for a stored token — the plaintext is never rendered", async () => {
    await render(true)

    expect(tokenInput()?.value).toBe("")
    expect(tokenInput()?.placeholder).toContain("•")
    expect(copyButton()?.disabled).toBe(true)
    expect(buttonByText("actions.regenerate")).toBeDefined()
  })

  it("generate mints a workspace-prefixed base64url token and enables copy", async () => {
    await render(false)

    await clickGenerate()

    expect(tokenInput()?.value).toMatch(GENERATED_TOKEN_PATTERN)
    expect(copyButton()?.disabled).toBe(false)
  })

  it("a failed save keeps the just-generated draft on screen for retry", async () => {
    await render(false)
    await clickGenerate()
    const draft = tokenInput()?.value
    expect(draft).toMatch(GENERATED_TOKEN_PATTERN)

    await act(() => {
      capturedActionProps.onError?.({ error: { serverError: "boom" } })
    })

    // The plaintext exists only in this form state — an error must not
    // reset the form, or the token is lost with no way to recover it.
    expect(tokenInput()?.value).toBe(draft)
    expect(toastError).toHaveBeenCalledWith("boom")
  })

  it("a successful save keeps the token visible and flips to regenerate", async () => {
    await render(false)
    await clickGenerate()
    const draft = tokenInput()?.value

    await act(() => {
      capturedActionProps.onSuccess?.({})
    })

    expect(tokenInput()?.value).toBe(draft)
    expect(buttonByText("actions.regenerate")).toBeDefined()
    expect(toastSuccess).toHaveBeenCalled()
  })

  it("copy copies the draft token to the clipboard", async () => {
    await render(false)
    await clickGenerate()
    const draft = tokenInput()?.value

    await act(() => {
      copyButton()?.click()
    })

    expect(copyToClipboard).toHaveBeenCalledWith(draft)
  })
})
