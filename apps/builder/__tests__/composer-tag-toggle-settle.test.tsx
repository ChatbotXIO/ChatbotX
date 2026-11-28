// @vitest-environment jsdom

import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type Ids = { workspaceId: string; contactId: string }
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    tagsAPI: {
      key: () => ["tags"],
      privateListWorkspaceTagOptionsAPI: {
        key: ({ input }: { input: Ids }) => [
          "options",
          input.workspaceId,
          input.contactId,
        ],
      },
    },
    contactsAPIs: {
      listContactTagsAuthenticatedAPI: {
        queryOptions: ({ input }: { input: Ids }) => ({
          queryKey: ["contact-tags", input.workspaceId, input.contactId],
        }),
      },
      getContactAuthenticatedAPI: {
        queryOptions: ({ input }: { input: Ids }) => ({
          queryKey: ["get-contact", input.workspaceId, input.contactId],
        }),
      },
    },
  },
}))

const addById = vi.fn()
vi.mock("@/features/contacts/actions/add-contact-tag-by-id.action", () => ({
  addContactTagByIdAction: (...args: unknown[]) => addById(...args),
}))
vi.mock("@/features/contacts/actions/remove-contact-tag-by-id.action", () => ({
  removeContactTagByIdAction: vi.fn(),
}))

const { useComposerTagToggle } = await import(
  "@/features/messages/hooks/use-composer-tag-toggle"
)

const TAGS_KEY = ["contact-tags", "w1", "c1"]
const tagB = { id: "b", name: "B" }

describe("useComposerTagToggle settle", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  let toggle: ReturnType<typeof useComposerTagToggle>["toggle"]

  const Probe = () => {
    toggle = useComposerTagToggle({
      workspaceId: "w1",
      contactId: "c1",
      onError: vi.fn(),
    }).toggle
    return null
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    })
    addById.mockReset().mockResolvedValue({
      data: { contactId: "c1", tagId: "a", tag: { id: "a", name: "A" } },
    })
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      )
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    queryClient.clear()
  })

  const clickAdd = async () => {
    await act(() => {
      toggle({ id: "a", name: "A" }, "add")
      return Promise.resolve()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  test("a settle during a first load reads again once it lands, so a pre-toggle answer never stays", async () => {
    let release: (value: unknown) => void = () => undefined
    const afterToggle = { data: [tagB, { id: "a", name: "A" }] }
    const queryFn = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve
          }),
      )
      .mockResolvedValue(afterToggle)
    const first = queryClient.fetchQuery({ queryKey: TAGS_KEY, queryFn })
    await clickAdd()
    expect(queryFn).toHaveBeenCalledTimes(1)

    release({ data: [tagB] })
    await first
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(TAGS_KEY)).toEqual(afterToggle)
  })

  test("a settle during an invalidation refetch keeps the other agent's change", async () => {
    queryClient.setQueryData(TAGS_KEY, { data: [] })
    const reads: ((value: unknown) => void)[] = []
    const queryFn = vi.fn(
      () =>
        new Promise((resolve) => {
          reads.push(resolve)
        }),
    )
    const observer = new QueryObserver(queryClient, {
      queryKey: TAGS_KEY,
      queryFn,
    })
    const unsubscribe = observer.subscribe(() => undefined)
    queryClient.invalidateQueries({ queryKey: TAGS_KEY })
    expect(reads).toHaveLength(1)

    await clickAdd()
    // The read that began before the toggle is superseded by a fresh one.
    expect(reads.length).toBeGreaterThanOrEqual(2)
    for (const resolve of reads) {
      resolve({ data: [tagB, { id: "a", name: "A" }] })
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    unsubscribe()
    const data = queryClient.getQueryData<{ data: { id: string }[] }>(TAGS_KEY)
    expect(data?.data.map((item) => item.id).sort()).toEqual(["a", "b"])
  })

  test("with no read in flight the patch costs zero extra requests", async () => {
    queryClient.setQueryData(TAGS_KEY, { data: [tagB] })
    const queryFn = vi.fn().mockResolvedValue({ data: [] })
    queryClient.setQueryDefaults(TAGS_KEY, { queryFn })

    await clickAdd()

    expect(queryFn).not.toHaveBeenCalled()
    expect(
      queryClient
        .getQueryData<{ data: { id: string }[] }>(TAGS_KEY)
        ?.data.map((item) => item.id),
    ).toEqual(["b", "a"])
  })
})
