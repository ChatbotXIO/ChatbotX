// @vitest-environment jsdom

import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const router = { refresh: vi.fn() }
const toast = { error: vi.fn(), success: vi.fn() }
const useActionMock = vi.hoisted(() => ({
  execute: vi.fn(),
  options: undefined as
    | {
        onError?: (args: {
          error: {
            serverError?: string
            validationErrors?: { _errors?: string[] }
          }
        }) => void
        onSuccess?: () => void
      }
    | undefined,
}))

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: Date) => value.toISOString() }),
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: typeof useActionMock.options) => {
    useActionMock.options = options
    return { execute: useActionMock.execute, isPending: false }
  },
}))
vi.mock("sonner", () => ({ toast }))
vi.mock("next/image", () => ({ default: (props: ReactNode) => props }))
vi.mock("@/features/mcp-oauth/actions/revoke-mcp-oauth-grant.action", () => ({
  revokeMcpOAuthGrantAction: vi.fn(),
}))

const passthrough = ({ children }: { children: ReactNode }) => children
vi.mock("@chatbotx.io/ui/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? children : null,
  AlertDialogAction: ({ children, ...props }: { children: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AlertDialogCancel: passthrough,
  AlertDialogContent: passthrough,
  AlertDialogDescription: passthrough,
  AlertDialogFooter: passthrough,
  AlertDialogHeader: passthrough,
  AlertDialogTitle: passthrough,
}))
vi.mock("@chatbotx.io/ui/components/ui/badge", () => ({ Badge: passthrough }))
vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))
vi.mock("@chatbotx.io/ui/components/ui/table", () => ({
  Table: passthrough,
  TableBody: passthrough,
  TableCell: ({ children, ...props }: { children: ReactNode }) => (
    <td {...props}>{children}</td>
  ),
  TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
  TableHeader: passthrough,
  TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}))
vi.mock("lucide-react", () => ({
  Loader2Icon: passthrough,
  Trash2Icon: passthrough,
}))

const { McpOAuthGrantsTable } = await import(
  "../src/features/mcp-oauth/components/mcp-oauth-grants-table"
)

let container: HTMLDivElement
let root: Root
const render = (
  grants: Parameters<typeof McpOAuthGrantsTable>[0]["grants"],
) => {
  act(() => {
    root.render(
      <McpOAuthGrantsTable grants={grants} workspaceId="workspace-1" />,
    )
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("McpOAuthGrantsTable", () => {
  test("renders the empty state", () => {
    render([])

    expect(container.textContent).toContain("grants.empty")
  })

  test("renders a consent with no live token and only one description", () => {
    render([
      {
        activeUntil: null,
        clientIcon: null,
        clientId: "claude",
        clientName: "Claude",
        firstAuthorizedAt: "2026-10-01T00:00:00.000Z",
        lastRefreshedAt: null,
        scopes: ["openid"],
      },
    ])

    expect(container.textContent).toContain("grants.noActiveToken")
    expect(container.textContent?.match(/grants.description/g)).toHaveLength(1)
  })

  test("submits the selected client and refreshes after success", () => {
    render([
      {
        activeUntil: null,
        clientIcon: null,
        clientId: "claude",
        clientName: "Claude",
        firstAuthorizedAt: "2026-10-01T00:00:00.000Z",
        lastRefreshedAt: null,
        scopes: ["openid"],
      },
    ])

    const revokeButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="grants.revoke"]',
    )
    act(() => revokeButton?.click())
    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "grants.revoke",
    )
    act(() => confirmButton?.click())

    expect(useActionMock.execute).toHaveBeenCalledWith({ clientId: "claude" })

    act(() => useActionMock.options?.onSuccess?.())
    expect(toast.success).toHaveBeenCalledWith("grants.revokedSuccess")
    expect(router.refresh).toHaveBeenCalled()
  })

  test("shows the fallback error and refreshes after a failed revoke", () => {
    render([])

    act(() => useActionMock.options?.onError?.({ error: {} }))

    expect(toast.error).toHaveBeenCalledWith("messages.unknownError")
    expect(router.refresh).toHaveBeenCalled()
  })
})
