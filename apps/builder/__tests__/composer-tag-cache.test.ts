import { QueryClient } from "@tanstack/react-query"
import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    tagsAPI: {
      privateListWorkspaceTagOptionsAPI: {
        key: ({
          input,
        }: {
          input: { workspaceId: string; contactId: string }
        }) => ["options", input.workspaceId, input.contactId],
      },
    },
  },
}))

const {
  currentTagToggleSettleSequence,
  subscribeTagToggleQueue,
  tagToggleQueueKey,
} = await import("@/features/messages/lib/tag-toggle-queue")
const { loadedTagOptionIds, patchTagOptionsAppliedFromServer } = await import(
  "@/features/messages/lib/composer-tag-cache"
)

const WORKSPACE = "w1"
const CONTACT = "c1"
const optionsKey = (search: string) => ["options", WORKSPACE, CONTACT, search]

type Page = { data: { id: string; applied?: boolean }[]; pageCount: number }

const seed = (queryClient: QueryClient, search = "") =>
  queryClient.setQueryData(optionsKey(search), {
    pageParams: [1],
    pages: [
      {
        data: [
          { id: "1", applied: false },
          { id: "2", applied: true },
          { id: "3", applied: false },
        ],
        pageCount: 1,
      },
    ],
  })

const appliedOf = (queryClient: QueryClient, search = "") =>
  queryClient
    .getQueryData<{ pages: Page[] }>(optionsKey(search))
    ?.pages.flatMap((page) =>
      page.data.filter((option) => option.applied).map((option) => option.id),
    )

const flush = async () => {
  for (let turn = 0; turn < 5; turn++) {
    await Promise.resolve()
  }
}

describe("patchTagOptionsAppliedFromServer", () => {
  const unsubscribers: (() => void)[] = []
  afterEach(() => {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe()
    }
  })

  const clickTag = (tagId: string, intent: "add" | "remove") => {
    const sends: (() => void)[] = []
    const subscription = subscribeTagToggleQueue(
      tagToggleQueueKey(WORKSPACE, CONTACT),
      {
        send: () =>
          new Promise<void>((resolve) => {
            sends.push(resolve)
          }),
        onFailure: vi.fn(),
        settle: async () => undefined,
      },
      { onChange: vi.fn(), onHold: vi.fn(), onRelease: vi.fn() },
    )
    unsubscribers.push(subscription.unsubscribe)
    subscription.queue.request(tagId, intent)
    return {
      commit: async () => {
        sends.shift()?.()
        await flush()
      },
    }
  }

  test("writes the answer into every cached search and returns nothing skipped", () => {
    const queryClient = new QueryClient()
    seed(queryClient)
    seed(queryClient, "al")

    const skipped = patchTagOptionsAppliedFromServer(queryClient, {
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      checkedTagIds: ["1", "2", "3"],
      appliedTagIds: ["1"],
      requestSequence: currentTagToggleSettleSequence(),
    })

    expect(skipped).toEqual([])
    expect(appliedOf(queryClient)).toEqual(["1"])
    expect(appliedOf(queryClient, "al")).toEqual(["1"])
  })

  test("a tag with an unsettled click is left alone and returned for a recheck", async () => {
    const queryClient = new QueryClient()
    seed(queryClient)
    const click = clickTag("3", "add")

    const skipped = patchTagOptionsAppliedFromServer(queryClient, {
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      checkedTagIds: ["1", "2", "3"],
      appliedTagIds: [],
      requestSequence: currentTagToggleSettleSequence(),
    })

    expect(skipped).toEqual(["3"])
    // 2 is cleared by the answer; 3 keeps what the cache held.
    expect(appliedOf(queryClient)).toEqual([])
    await click.commit()
  })

  test("a stale answer cannot overwrite a tag whose click settled after the check began", async () => {
    const queryClient = new QueryClient()
    seed(queryClient)
    const sequenceAtStart = currentTagToggleSettleSequence()
    const click = clickTag("1", "add")
    await click.commit()
    // The click's own patch landed in the cache.
    queryClient.setQueryData(optionsKey(""), {
      pageParams: [1],
      pages: [
        {
          data: [
            { id: "1", applied: true },
            { id: "2", applied: true },
            { id: "3", applied: false },
          ],
          pageCount: 1,
        },
      ],
    })

    // The answer was read before the click committed: tag 1 absent.
    const skipped = patchTagOptionsAppliedFromServer(queryClient, {
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      checkedTagIds: ["1", "2", "3"],
      appliedTagIds: ["2"],
      requestSequence: sequenceAtStart,
    })

    expect(skipped).toEqual(["1"])
    expect(appliedOf(queryClient)).toEqual(["1", "2"])
  })

  test("a check begun after the settlement applies the tag normally", async () => {
    const queryClient = new QueryClient()
    seed(queryClient)
    const click = clickTag("1", "add")
    await click.commit()

    const skipped = patchTagOptionsAppliedFromServer(queryClient, {
      workspaceId: WORKSPACE,
      contactId: CONTACT,
      checkedTagIds: ["1"],
      appliedTagIds: [],
      requestSequence: currentTagToggleSettleSequence(),
    })

    expect(skipped).toEqual([])
  })
})

describe("loadedTagOptionIds", () => {
  test("unions the ids of every cached search", () => {
    const queryClient = new QueryClient()
    seed(queryClient)
    seed(queryClient, "al")

    expect(
      loadedTagOptionIds(queryClient, {
        workspaceId: WORKSPACE,
        contactId: CONTACT,
      }).sort(),
    ).toEqual(["1", "2", "3"])
  })
})
