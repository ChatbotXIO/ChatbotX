// @vitest-environment jsdom

import type { UseQueryResult } from "@tanstack/react-query"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type {
  ListContactsRequest,
  ListContactsTableResponse,
} from "@/features/contacts/schema/query"

const { mockListContacts } = vi.hoisted(() => ({
  mockListContacts: vi.fn(),
}))

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactsAPIs: {
      listContactsByPOSTAuthenticatedAPI: {
        key: () => ["contacts", "list"],
        queryOptions: ({ input }: { input: ListContactsRequest }) => ({
          queryKey: ["contacts", "list", input],
          queryFn: () => mockListContacts(input),
        }),
      },
    },
  },
}))

type ContactsQueryResult = UseQueryResult<ListContactsTableResponse, Error>

const { useContacts, useInvalidateContacts } = await import(
  "@/features/contacts/hooks/use-contacts"
)

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
      },
    },
  })

const makeInput = (page: number): ListContactsRequest => ({
  workspaceId: "workspace-1",
  page,
  perPage: 50,
  sort: [{ id: "createdAt", desc: true }],
})

const makeResponse = (id: string): ListContactsTableResponse =>
  ({
    data: [{ id }],
    pageCount: 1,
    totalCount: 1,
    totalCountCapped: false,
  }) as ListContactsTableResponse

const waitForQueryResult = () => {
  const deferred = Promise.withResolvers<void>()
  setTimeout(deferred.resolve, 0)
  return deferred.promise
}

const waitForObserver = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) {
      return
    }

    await act(async () => {
      await waitForQueryResult()
    })
  }
}

function ContactsProbe({
  input,
  onRender,
}: {
  input: ListContactsRequest
  onRender: (result: ContactsQueryResult) => void
}) {
  const result = useContacts(input)
  onRender(result)

  return <output>{result.data?.data[0]?.id ?? "none"}</output>
}

function InvalidateContactsProbe({
  onReady,
}: {
  onReady: (invalidate: () => Promise<void>) => void
}) {
  onReady(useInvalidateContacts())
  return null
}

describe("useContacts", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = makeQueryClient()
    mockListContacts.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  test("fetches on mount and keeps the prior page as a placeholder while the next page loads", async () => {
    const pageOneInput = makeInput(1)
    const pageOneRequest = Promise.withResolvers<ListContactsTableResponse>()
    const pageTwoRequest = Promise.withResolvers<ListContactsTableResponse>()
    mockListContacts.mockImplementation((input: ListContactsRequest) =>
      input.page === 1 ? pageOneRequest.promise : pageTwoRequest.promise,
    )

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContactsProbe input={pageOneInput} onRender={() => undefined} />
        </QueryClientProvider>,
      )
    })

    expect(mockListContacts).toHaveBeenCalledWith(pageOneInput)
    pageOneRequest.resolve(makeResponse("contact-a"))
    await waitForObserver(() => container.textContent === "contact-a")

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContactsProbe input={makeInput(2)} onRender={() => undefined} />
        </QueryClientProvider>,
      )
    })

    expect(mockListContacts).toHaveBeenLastCalledWith(makeInput(2))
    expect(container.textContent).toBe("contact-a")
    pageTwoRequest.resolve(makeResponse("contact-b"))
    await waitForObserver(() => container.textContent === "contact-b")

    expect(container.textContent).toBe("contact-b")
  })

  test("deduplicates matching observers", async () => {
    const input = makeInput(2)
    const request = Promise.withResolvers<ListContactsTableResponse>()
    mockListContacts.mockReturnValue(request.promise)

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContactsProbe input={input} onRender={() => undefined} />
          <ContactsProbe input={input} onRender={() => undefined} />
        </QueryClientProvider>,
      )
    })
    expect(mockListContacts).toHaveBeenCalledTimes(1)

    request.resolve(makeResponse("contact-b"))
    await act(async () => {
      await request.promise
    })
  })

  test("fetches filter and sort inputs on their query keys", async () => {
    const baseInput = makeInput(1)
    const sortedInput = {
      ...baseInput,
      sort: [{ id: "fullName", desc: false }],
    }
    const filteredInput: ListContactsRequest = {
      ...baseInput,
      contactFilter: {
        operator: "and" as const,
        conditions: [
          {
            field: "inbox",
            operator: "eq",
            value: ["inbox-1"],
          },
        ],
      },
    }
    mockListContacts.mockResolvedValue(makeResponse("contact-b"))

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContactsProbe input={sortedInput} onRender={() => undefined} />
        </QueryClientProvider>,
      )
      await waitForQueryResult()
    })

    expect(mockListContacts).toHaveBeenLastCalledWith(sortedInput)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContactsProbe input={filteredInput} onRender={() => undefined} />
        </QueryClientProvider>,
      )
      await waitForQueryResult()
    })

    expect(mockListContacts).toHaveBeenLastCalledWith(filteredInput)
  })

  test("exposes a request error without storing data under its query key", async () => {
    const pageTwoInput = makeInput(2)
    const queryError = new Error("network error")
    const renderedResults: ContactsQueryResult[] = []
    mockListContacts.mockRejectedValue(queryError)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContactsProbe
            input={pageTwoInput}
            onRender={(result) => {
              renderedResults.push(result)
            }}
          />
        </QueryClientProvider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitForObserver(() =>
      renderedResults.some((result) => result.isError),
    )
    expect(mockListContacts).toHaveBeenCalledTimes(1)
    expect(
      queryClient.getQueryState(["contacts", "list", pageTwoInput])?.error,
    ).toBe(queryError)
    expect(
      queryClient.getQueryData(["contacts", "list", pageTwoInput]),
    ).toBeUndefined()
  })
  test("invalidates every cached contacts-list variant after a mutation", async () => {
    const pageOneInput = makeInput(1)
    const pageTwoInput = makeInput(2)
    queryClient.setQueryData(
      ["contacts", "list", pageOneInput],
      makeResponse("contact-a"),
    )
    queryClient.setQueryData(
      ["contacts", "list", pageTwoInput],
      makeResponse("contact-b"),
    )
    let invalidateContacts: (() => Promise<void>) | undefined

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InvalidateContactsProbe
            onReady={(invalidate) => {
              invalidateContacts = invalidate
            }}
          />
        </QueryClientProvider>,
      )
    })

    await act(async () => {
      await invalidateContacts?.()
    })

    expect(
      queryClient.getQueryState(["contacts", "list", pageOneInput])
        ?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(["contacts", "list", pageTwoInput])
        ?.isInvalidated,
    ).toBe(true)
  })
})
