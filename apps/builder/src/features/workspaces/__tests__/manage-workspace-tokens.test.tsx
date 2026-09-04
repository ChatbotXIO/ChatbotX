// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { WorkspaceApiTokenDto } from "../schema/workspace-token-dto"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString(),
  }),
}))

const routerRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock("../actions/create-workspace-token-action", () => ({
  createWorkspaceTokenAction: { bind: () => vi.fn() },
}))

let deleteExecute = vi.fn()
let deleteIsPending = false
type DeleteActionProps = {
  onSuccess?: () => void
  onError?: (payload: {
    error: { serverError?: string; validationErrors?: { _errors?: string[] } }
  }) => void
}
let capturedDeleteProps: DeleteActionProps = {}
vi.mock("../actions/delete-workspace-token-action", () => ({
  deleteWorkspaceTokenAction: { bind: () => vi.fn() },
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: DeleteActionProps) => {
    capturedDeleteProps = options
    return { execute: deleteExecute, isPending: deleteIsPending }
  },
}))

type CreateActionProps = {
  onSuccess?: (payload: { data?: { token: string } }) => void
  onError?: (payload: { error: { serverError?: string } }) => void
}

let capturedCreateProps: CreateActionProps = {}

vi.mock("@next-safe-action/adapter-react-hook-form/hooks", async () => {
  const { useForm } = await import("react-hook-form")
  return {
    useHookFormAction: (
      _action: unknown,
      _resolver: unknown,
      options: {
        actionProps: CreateActionProps
        formProps: Parameters<typeof useForm>[0]
      },
    ) => {
      capturedCreateProps = options.actionProps
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

const baseToken: WorkspaceApiTokenDto = {
  id: "token-1",
  name: "My token",
  permission: "full",
  tokenPrefix: "cbx_ws_abcd",
  createdAt: new Date("2026-01-01T00:00:00Z"),
}

describe("ManageWorkspaceTokens", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    capturedCreateProps = {}
    capturedDeleteProps = {}
    deleteExecute = vi.fn()
    deleteIsPending = false
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function render(tokens: WorkspaceApiTokenDto[]) {
    const { ManageWorkspaceTokens } = await import("../manage-workspace-tokens")
    act(() => {
      root.render(
        <ManageWorkspaceTokens tokens={tokens} workspaceId={WORKSPACE_ID} />,
      )
    })
  }

  it("shows an empty state when there are no tokens", async () => {
    await render([])

    const emptyCell = container.querySelector("tbody td")
    expect(emptyCell?.textContent).toContain("developerAccessToken.empty")
    expect(container.querySelector("table")).not.toBeNull()
  })

  it("renders a row per token, masking legacy null-prefix tokens generically", async () => {
    const legacyToken = {
      ...baseToken,
      id: "token-2",
      name: "Legacy token",
      tokenPrefix: null,
    }
    await render([baseToken, legacyToken])

    const rows = container.querySelectorAll("tbody tr")
    expect(rows).toHaveLength(2)
    expect(container.textContent).toContain("cbx_ws_abcd••••••••")
    expect(container.textContent).toContain("••••••••••••")
    expect(container.textContent).not.toContain("null")
    // The DTO passed in must never carry a hash for the page to leak.
    expect(container.innerHTML).not.toContain("tokenHash")
  })

  it("create success reveals the returned token exactly once", async () => {
    await render([])

    await act(async () => {
      capturedCreateProps.onSuccess?.({ data: { token: "cbx_ws_secret123" } })
      await Promise.resolve()
    })

    const tokenInput = document.body.querySelector<HTMLInputElement>("input")
    expect(tokenInput?.value).toBe("cbx_ws_secret123")
  })

  it("dismissing the reveal dialog refreshes the token list", async () => {
    await render([])

    await act(async () => {
      capturedCreateProps.onSuccess?.({ data: { token: "cbx_ws_secret123" } })
      await Promise.resolve()
    })

    const doneButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent === "fields.api.tokenReveal.done")

    await act(async () => {
      doneButton?.click()
      await Promise.resolve()
    })

    expect(routerRefresh).toHaveBeenCalled()
  })

  it("delete requires confirmation before executing", async () => {
    await render([baseToken])

    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="actions.delete"]',
    )
    await act(async () => {
      deleteButton?.click()
      await Promise.resolve()
    })

    // The delete action must not fire until the confirmation dialog's
    // destructive action is clicked.
    expect(deleteExecute).not.toHaveBeenCalled()

    const confirmButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent === "actions.delete")

    await act(async () => {
      confirmButton?.click()
      await Promise.resolve()
    })

    expect(deleteExecute).toHaveBeenCalledWith({ id: baseToken.id })
  })

  it("surfaces a validation error and refreshes when the token is already gone", async () => {
    await render([baseToken])

    await act(async () => {
      capturedDeleteProps.onError?.({
        error: { validationErrors: { _errors: ["Token no longer exists"] } },
      })
      await Promise.resolve()
    })

    expect(toastError).toHaveBeenCalledWith("Token no longer exists")
    expect(routerRefresh).toHaveBeenCalled()
  })
})
