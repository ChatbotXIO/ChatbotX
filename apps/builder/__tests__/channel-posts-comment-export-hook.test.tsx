// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type StartOptions = { onSuccess?: (result: { fileId: string }) => void }
type QueryOptions = {
  enabled: boolean
  input: { fileId: string; workspaceId: string }
  refetchInterval: (query: { state: { data?: { status: string } } }) => unknown
}

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  invalidate: vi.fn(),
  queryOptions: undefined as unknown,
  queryState: {} as { data?: unknown; isError?: boolean },
  startOptions: undefined as unknown,
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values ? `${key}|${JSON.stringify(values)}` : key,
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: StartOptions) => {
    mocks.startOptions = options
    return { isPending: false, mutate: vi.fn() }
  },
  useQuery: (options: QueryOptions) => {
    mocks.queryOptions = options
    return { data: undefined, isError: false, ...mocks.queryState }
  },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    channelPostManagementAPIs: {
      privateGetChannelPostCommentExportAPI: {
        key: () => ["status"],
        queryOptions: (options: unknown) => options,
      },
      privateStartChannelPostCommentExportAPI: {
        mutationOptions: (options: unknown) => options,
      },
    },
  },
}))
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    channelPostManagementAPIs: {
      privateGetChannelPostCommentExportAPI: mocks.getStatus,
    },
  },
}))

const { useChannelCommentExport } = await import(
  "@/features/channel-posts/hooks/use-channel-comment-export"
)

let root: Root | undefined
let container: HTMLDivElement | undefined

const Harness = () => {
  useChannelCommentExport("ws-1")
  return null
}

const render = () => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(<Harness />))
}

const rerender = () => act(() => root?.render(<Harness />))
const query = () => mocks.queryOptions as QueryOptions
const started = (fileId: string) =>
  act(() => (mocks.startOptions as StartOptions).onSuccess?.({ fileId }))

const status = (overrides: Record<string, unknown>) => ({
  downloadUrl: null,
  expectedRows: null,
  failureReason: null,
  fileId: "9",
  rowCount: 0,
  status: "pending",
  truncated: false,
  ...overrides,
})

beforeEach(() => {
  mocks.queryState = {}
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  vi.clearAllMocks()
})

describe("useChannelCommentExport", () => {
  test("starting shows the toast, follows the file and refreshes the status query", () => {
    render()
    expect(query().enabled).toBe(false)

    started("9")

    expect(mocks.toast.loading).toHaveBeenCalledWith(
      "posts.channelExport.started",
      expect.any(Object),
    )
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["status"] })
    expect(query().enabled).toBe(true)
    expect(query().input).toEqual({ fileId: "9", workspaceId: "ws-1" })
  })

  test("polling stops on uploaded and on failed, not while pending", () => {
    render()

    const poll = (value: string) =>
      query().refetchInterval({ state: { data: { status: value } } })
    expect(poll("pending")).toBe(5000)
    expect(poll("uploaded")).toBe(false)
    expect(poll("failed")).toBe(false)
  })

  test("pending shows the rows read, with the estimate only when there is one", () => {
    render()
    started("9")

    mocks.queryState = { data: status({ expectedRows: 40, rowCount: 12 }) }
    rerender()
    expect(mocks.toast.loading).toHaveBeenLastCalledWith(
      'posts.channelExport.progressEstimate|{"count":12,"expected":40}',
      expect.any(Object),
    )

    mocks.queryState = { data: status({ expectedRows: 0, rowCount: 3 }) }
    rerender()
    expect(mocks.toast.loading).toHaveBeenLastCalledWith(
      'posts.channelExport.progress|{"count":3}',
      expect.any(Object),
    )
  })

  test("uploaded offers the Download action and stops following", () => {
    render()
    started("9")

    mocks.queryState = { data: status({ rowCount: 5, status: "uploaded" }) }
    rerender()

    expect(mocks.toast.success).toHaveBeenCalledWith(
      "posts.channelExport.ready",
      expect.objectContaining({
        action: expect.objectContaining({
          label: "posts.channelExport.download",
        }),
      }),
    )
    expect(mocks.toast.warning).not.toHaveBeenCalled()
    expect(query().enabled).toBe(false)
  })

  test("a truncated file also warns that it is incomplete", () => {
    render()
    started("9")

    mocks.queryState = { data: status({ status: "uploaded", truncated: true }) }
    rerender()

    expect(mocks.toast.warning).toHaveBeenCalledWith(
      "posts.channelExport.truncated",
    )
  })

  test("the Download action signs a fresh link on click and opens it in the tab opened by the click", async () => {
    render()
    started("9")
    mocks.queryState = { data: status({ status: "uploaded" }) }
    rerender()
    const tab = { close: vi.fn(), location: { href: "" }, opener: {} }
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    mocks.getStatus.mockResolvedValue({ downloadUrl: "https://files/x.csv" })

    const [, options] = mocks.toast.success.mock.calls[0] as [
      string,
      { action: { onClick: () => Promise<void> } },
    ]
    await act(() => options.action.onClick())

    expect(window.open).toHaveBeenCalledWith("", "_blank")
    expect(mocks.getStatus).toHaveBeenCalledWith({
      fileId: "9",
      workspaceId: "ws-1",
    })
    expect(tab.opener).toBeNull()
    expect(tab.location.href).toBe("https://files/x.csv")
  })

  test("a link that cannot be signed closes the tab and says so", async () => {
    render()
    started("9")
    mocks.queryState = { data: status({ status: "uploaded" }) }
    rerender()
    const tab = { close: vi.fn(), location: { href: "" }, opener: {} }
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    mocks.getStatus.mockResolvedValue({ downloadUrl: null })

    const [, options] = mocks.toast.success.mock.calls[0] as [
      string,
      { action: { onClick: () => Promise<void> } },
    ]
    await act(() => options.action.onClick())

    expect(tab.close).toHaveBeenCalled()
    expect(tab.location.href).toBe("")
    expect(mocks.toast.error).toHaveBeenCalledWith("messages.errorLoadingData")
  })

  test("failed says why, by reason", () => {
    render()
    started("9")

    mocks.queryState = {
      data: status({ failureReason: "channelDisconnected", status: "failed" }),
    }
    rerender()

    expect(mocks.toast.error).toHaveBeenCalledWith(
      "posts.channelExport.failure.channelDisconnected",
      expect.any(Object),
    )
    expect(query().enabled).toBe(false)
  })

  test("a status that cannot be read ends the follow-up with a generic message", () => {
    render()
    started("9")

    mocks.queryState = { isError: true }
    rerender()

    expect(mocks.toast.error).toHaveBeenCalledWith(
      "posts.channelExport.failure.failed",
      expect.any(Object),
    )
    expect(query().enabled).toBe(false)
  })

  test("leaving the page dismisses the toast", () => {
    render()
    started("9")

    act(() => root?.unmount())
    root = undefined

    expect(mocks.toast.dismiss).toHaveBeenCalled()
  })
})
