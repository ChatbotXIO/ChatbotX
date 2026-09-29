// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { WhatsappCallHistoryResource } from "@/features/whatsapp-calls/schema/resource"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMock }))

type UseActionOptions = {
  onSuccess?: (args: {
    data?: { data: WhatsappCallHistoryResource[]; nextCursor: string | null }
  }) => void
  onError?: (args: { error: unknown }) => void
}

const useActionMock = vi.hoisted(() => ({
  execute: vi.fn(),
  isPending: false,
  lastOptions: undefined as UseActionOptions | undefined,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: UseActionOptions) => {
    useActionMock.lastOptions = options
    return {
      execute: useActionMock.execute,
      isPending: useActionMock.isPending,
    }
  },
}))

const setActivityParamMock = vi.hoisted(() => vi.fn())
const setInboxParamMock = vi.hoisted(() => vi.fn())
const setAgentParamMock = vi.hoisted(() => vi.fn())
vi.mock("nuqs", () => ({
  useQueryState: (key: string) => {
    if (key === "inboxId") {
      return [undefined, setInboxParamMock]
    }
    if (key === "agentUserId") {
      return [undefined, setAgentParamMock]
    }
    return [undefined, setActivityParamMock]
  },
}))

vi.mock("@/features/whatsapp-calls/actions/list-whatsapp-calls.action", () => ({
  listWhatsappCallsAction: {
    bind: () => "bound-action",
  },
}))

vi.mock("@/features/whatsapp-calls/calls-table", () => ({
  CallsTable: ({ data }: { data: WhatsappCallHistoryResource[] }) => (
    <div data-row-count={data.length} data-testid="calls-table" />
  ),
}))

vi.mock("@/features/whatsapp-calls/calls-filter-bar", () => ({
  CallsFilterBar: ({
    onActivityChange,
    onInboxChange,
    onAgentChange,
  }: {
    onActivityChange: (activity: string | undefined) => void
    onInboxChange: (inboxId: string | undefined) => void
    onAgentChange: (agentUserId: string | undefined) => void
  }) => (
    <>
      <button
        data-testid="filter-bar-trigger"
        onClick={() => onActivityChange("missed")}
        type="button"
      >
        change-filter
      </button>
      <button
        data-testid="inbox-filter-trigger"
        onClick={() => onInboxChange("inbox-2")}
        type="button"
      >
        change-inbox
      </button>
      <button
        data-testid="agent-filter-trigger"
        onClick={() => onAgentChange("agent-2")}
        type="button"
      >
        change-agent
      </button>
    </>
  ),
}))

vi.mock("@/features/whatsapp-calls/calls-empty-state", () => ({
  CallsEmptyState: () => <div data-testid="empty-state" />,
}))

const { CallsPageClient } = await import(
  "../src/features/whatsapp-calls/calls-page-client"
)

const row = (id: string): WhatsappCallHistoryResource => ({
  id,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  direction: "userInitiated",
  status: "completed",
  outcome: "completed",
  kind: "answeredInbound",
  durationSeconds: 30,
  recordingPath: null,
  conversationId: "conversation-1",
  contact: { id: "contact-1", fullName: "Jane", avatar: null },
  inbox: { id: "inbox-1", name: "Support" },
  answeredByUser: null,
  initiatedByUser: null,
})

let container: HTMLDivElement
let root: Root

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

describe("CallsPageClient", () => {
  test("appends rows from a successful Load more and keeps the new nextCursor", () => {
    act(() => {
      root.render(
        <CallsPageClient
          activity={undefined}
          initialData={[row("call-1")]}
          initialNextCursor="cursor-1"
          workspaceId="ws-1"
        />,
      )
    })

    expect(
      container
        .querySelector('[data-testid="calls-table"]')
        ?.getAttribute("data-row-count"),
    ).toBe("1")

    act(() => {
      useActionMock.lastOptions?.onSuccess?.({
        data: { data: [row("call-2")], nextCursor: "cursor-2" },
      })
    })

    expect(
      container
        .querySelector('[data-testid="calls-table"]')
        ?.getAttribute("data-row-count"),
    ).toBe("2")
    // Load more button still renders since nextCursor is non-null.
    expect(container.textContent).toContain("loadMore")
  })

  test("hides the Load more button once nextCursor is exhausted (end of list)", () => {
    act(() => {
      root.render(
        <CallsPageClient
          activity={undefined}
          initialData={[row("call-1")]}
          initialNextCursor="cursor-1"
          workspaceId="ws-1"
        />,
      )
    })
    expect(container.textContent).toContain("loadMore")

    act(() => {
      useActionMock.lastOptions?.onSuccess?.({
        data: { data: [row("call-2")], nextCursor: null },
      })
    })

    expect(container.textContent).not.toContain("loadMore")
  })

  test("renders the empty state when there are zero rows", () => {
    act(() => {
      root.render(
        <CallsPageClient
          activity={undefined}
          initialData={[]}
          initialNextCursor={null}
          workspaceId="ws-1"
        />,
      )
    })

    expect(
      container.querySelector('[data-testid="empty-state"]'),
    ).not.toBeNull()
  })

  test("shows a translated error toast when the Load more action fails", () => {
    act(() => {
      root.render(
        <CallsPageClient
          activity={undefined}
          initialData={[row("call-1")]}
          initialNextCursor="cursor-1"
          workspaceId="ws-1"
        />,
      )
    })

    expect(useActionMock.lastOptions?.onError).toBeInstanceOf(Function)

    act(() => {
      useActionMock.lastOptions?.onError?.({ error: { serverError: "boom" } })
    })

    expect(toastMock.error).toHaveBeenCalledWith("loadMoreError")
  })

  // Chip changes go through nuqs' setter, never window.location.assign.
  test("changing the activity chip calls the nuqs setter, not window.location", () => {
    act(() => {
      root.render(
        <CallsPageClient
          activity={undefined}
          initialData={[row("call-1")]}
          initialNextCursor={null}
          workspaceId="ws-1"
        />,
      )
    })

    act(() => {
      container
        .querySelector('[data-testid="filter-bar-trigger"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(setActivityParamMock).toHaveBeenCalledWith("missed")
  })

  // Inbox/agent selects go through the same nuqs-setter navigation contract
  // as the activity chip (`shallow: false`), so selecting either re-runs
  // `page.tsx` server-side for page 1.
  test("changing the inbox filter calls the nuqs setter for inboxId", () => {
    act(() => {
      root.render(
        <CallsPageClient
          activity={undefined}
          initialData={[row("call-1")]}
          initialNextCursor={null}
          workspaceId="ws-1"
        />,
      )
    })

    act(() => {
      container
        .querySelector('[data-testid="inbox-filter-trigger"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(setInboxParamMock).toHaveBeenCalledWith("inbox-2")
  })

  test("changing the agent filter calls the nuqs setter for agentUserId", () => {
    act(() => {
      root.render(
        <CallsPageClient
          activity={undefined}
          initialData={[row("call-1")]}
          initialNextCursor={null}
          workspaceId="ws-1"
        />,
      )
    })

    act(() => {
      container
        .querySelector('[data-testid="agent-filter-trigger"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(setAgentParamMock).toHaveBeenCalledWith("agent-2")
  })

  test("Load more forwards the current inboxId/agentUserId alongside activity/cursor", () => {
    act(() => {
      root.render(
        <CallsPageClient
          activity="missed"
          agentUserId="agent-1"
          inboxId="inbox-1"
          initialData={[row("call-1")]}
          initialNextCursor="cursor-1"
          workspaceId="ws-1"
        />,
      )
    })

    // The "Load more" button is found by its text, not position, since the
    // filter bar renders several other buttons before it.
    const loadMoreButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent === "loadMore")
    act(() => {
      loadMoreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(useActionMock.execute).toHaveBeenCalledWith({
      activity: "missed",
      inboxId: "inbox-1",
      agentUserId: "agent-1",
      cursor: "cursor-1",
    })
  })
})
