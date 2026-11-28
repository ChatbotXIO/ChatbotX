// @vitest-environment jsdom

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useFormContext, useWatch } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
const toastError = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: { error: toastError } }))
vi.mock("@/features/tags/provider/tag-hook", () => ({
  useTagOptions: () => [],
}))

const addByName = vi.fn()
const removeByName = vi.fn()
const removeById = vi.fn()
vi.mock("@/features/contacts/actions/add-contact-tag.action", () => ({
  addContactTagAction: (...args: unknown[]) => addByName(...args),
}))
vi.mock("@/features/contacts/actions/remove-contact-tag.action", () => ({
  removeContactTagAction: (...args: unknown[]) => removeByName(...args),
}))
vi.mock("@/features/contacts/actions/remove-contact-tag-by-id.action", () => ({
  removeContactTagByIdAction: (...args: unknown[]) => removeById(...args),
}))

type Ids = { workspaceId: string; contactId: string }
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    tagsAPI: {
      key: () => ["tags"],
      privateListWorkspaceTagsAPI: { key: () => ["tags", "list"] },
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

const selectRef = vi.hoisted(() => ({
  current: null as null | ((tags: string[]) => void),
}))
vi.mock("@chatbotx.io/ui/components/ui/muhammada86/tags-input-field", () => ({
  // Like the real field: it writes the form value, then reports the change.
  TagsInputField: (props: { onSelect: (tags: string[]) => void }) => {
    const { control, setValue } = useFormContext<{ tags: string[] }>()
    const shown = useWatch({ control, name: "tags" })
    selectRef.current = (names) => {
      setValue("tags", names)
      props.onSelect(names)
    }
    return (
      <div>
        <input data-testid="tag-input" />
        <output data-testid="tag-value">{shown.join(",")}</output>
      </div>
    )
  },
}))

const { default: UpdateContactTagField } = await import(
  "@/features/contacts/components/update-contact-tag-field"
)

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tag = (id: string, name: string) => ({ id, name }) as never
const contact = { id: "c1" } as never
const TAGS_KEY = ["contact-tags", "w1", "c1"]

describe("UpdateContactTagField", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    toastError.mockReset()
    addByName.mockReset().mockResolvedValue({ data: {} })
    removeByName.mockReset().mockResolvedValue({ data: {} })
    removeById.mockReset().mockResolvedValue({ data: {} })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    queryClient.clear()
  })

  const render = (tags: unknown[]) =>
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <UpdateContactTagField
            contact={contact}
            tags={tags as never}
            workspaceId="w1"
          />
        </QueryClientProvider>,
      )
    })

  const select = async (names: string[]) => {
    await act(() => {
      selectRef.current?.(names)
      return Promise.resolve()
    })
  }

  test("a stale baseline sends only the local addition, never a replace", async () => {
    queryClient.setQueryData(TAGS_KEY, { data: [tag("1", "A")] })
    render([tag("1", "A")])

    await select(["A", "C"])

    expect(addByName).toHaveBeenCalledTimes(1)
    expect(addByName).toHaveBeenCalledWith("w1", { ids: ["c1"], tags: ["C"] })
    expect(removeById).not.toHaveBeenCalled()
    expect(removeByName).not.toHaveBeenCalled()
  })

  test("after another agent's tag B arrives, adding C still sends only C", async () => {
    render([tag("1", "A")])
    render([tag("1", "A"), tag("2", "B")])

    await select(["A", "B", "C"])

    expect(addByName).toHaveBeenCalledWith("w1", { ids: ["c1"], tags: ["C"] })
    expect(removeById).not.toHaveBeenCalled()
  })

  test("removing a tag removes only that tag, by id, and patches the cached list", async () => {
    queryClient.setQueryData(TAGS_KEY, {
      data: [tag("1", "A"), tag("2", "B")],
    })
    render([tag("1", "A"), tag("2", "B")])

    await select(["A"])

    expect(removeById).toHaveBeenCalledTimes(1)
    expect(removeById).toHaveBeenCalledWith("w1", {
      contactId: "c1",
      tagId: "2",
    })
    expect(addByName).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(TAGS_KEY)).toEqual({
      data: [tag("1", "A")],
    })
  })

  test("creating a new tag by typing a name goes through the by-name add", async () => {
    render([tag("1", "A")])

    await select(["A", "Brand new"])

    expect(addByName).toHaveBeenCalledWith("w1", {
      ids: ["c1"],
      tags: ["Brand new"],
    })
  })

  test("a refetch while the agent types keeps the input focused and mounted", () => {
    render([tag("1", "A")])
    const input = container.querySelector<HTMLInputElement>(
      "[data-testid=tag-input]",
    )
    input?.focus()
    expect(document.activeElement).toBe(input)

    render([tag("1", "A"), tag("2", "B")])

    expect(container.querySelector("[data-testid=tag-input]")).toBe(input)
    expect(document.activeElement).toBe(input)
    expect(input?.disabled).toBe(false)
  })

  describe("with the contact's tags read from the server", () => {
    const readTags = vi.fn()

    const Host = () => {
      const { data } = useQuery({
        queryKey: TAGS_KEY,
        queryFn: () => readTags(),
      })
      return data ? (
        <UpdateContactTagField
          contact={contact}
          tags={data.data}
          workspaceId="w1"
        />
      ) : null
    }

    const renderHost = async (initial: unknown[]) => {
      readTags.mockReset().mockResolvedValue({ data: initial })
      act(() => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <Host />
          </QueryClientProvider>,
        )
      })
      await vi.waitFor(() =>
        expect(
          container.querySelector("[data-testid=tag-value]"),
        ).not.toBeNull(),
      )
    }

    const shown = () =>
      container.querySelector("[data-testid=tag-value]")?.textContent

    const flush = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

    test("an added tag stays shown until the fresh list lands, and the next diff starts from it", async () => {
      await renderHost([tag("1", "A")])
      const refetch = deferred<unknown>()
      readTags.mockReturnValueOnce(refetch.promise)

      await select(["A", "C"])
      await flush()
      expect(shown()).toBe("A,C")

      await act(async () => {
        refetch.resolve({ data: [tag("1", "A"), tag("3", "C")] })
        await refetch.promise
      })
      await flush()
      expect(shown()).toBe("A,C")

      await select(["A", "C", "D"])
      expect(addByName).toHaveBeenLastCalledWith("w1", {
        ids: ["c1"],
        tags: ["D"],
      })
      expect(removeById).not.toHaveBeenCalled()
    })

    test("a failed re-read keeps the confirmed local tags, tells the agent, and diffs from them", async () => {
      await renderHost([tag("1", "A")])
      readTags.mockRejectedValueOnce(new Error("offline"))

      await select(["A", "C"])
      await flush()

      expect(shown()).toBe("A,C")
      expect(toastError).toHaveBeenCalledTimes(1)

      readTags.mockResolvedValue({ data: [tag("1", "A"), tag("3", "C")] })
      await select(["A", "C", "D"])
      await flush()
      expect(addByName).toHaveBeenLastCalledWith("w1", {
        ids: ["c1"],
        tags: ["D"],
      })
      expect(removeById).not.toHaveBeenCalled()
    })

    test("edits made while a submit is running are queued and none is lost", async () => {
      await renderHost([tag("1", "A")])
      const firstAdd = deferred<unknown>()
      addByName.mockReturnValueOnce(firstAdd.promise)

      await select(["A", "C"])
      await select(["A", "C", "D"])
      expect(addByName).toHaveBeenCalledTimes(1)
      expect(shown()).toBe("A,C,D")

      readTags.mockResolvedValue({
        data: [tag("1", "A"), tag("3", "C"), tag("4", "D")],
      })
      await act(async () => {
        firstAdd.resolve({ data: {} })
        await firstAdd.promise
      })
      await flush()

      expect(addByName.mock.calls.map((call) => call[1].tags)).toEqual([
        ["C"],
        ["D"],
      ])
      expect(shown()).toBe("A,C,D")
    })

    test("a tag renamed while a change is pending is still removed by the id the editor showed", async () => {
      await renderHost([tag("1", "A"), tag("2", "B")])
      const add = deferred<unknown>()
      addByName.mockReturnValueOnce(add.promise)

      await select(["A", "B", "C"])
      act(() => {
        queryClient.setQueryData(TAGS_KEY, {
          data: [tag("1", "A"), tag("2", "B renamed")],
        })
      })
      await select(["A", "C"])

      readTags.mockResolvedValue({ data: [tag("1", "A"), tag("3", "C")] })
      await act(async () => {
        add.resolve({ data: {} })
        await add.promise
      })
      await flush()

      expect(removeById).toHaveBeenCalledWith("w1", {
        contactId: "c1",
        tagId: "2",
      })
      expect(removeByName).not.toHaveBeenCalled()
    })

    test("a contact the server skipped is a failure, shown to the agent", async () => {
      await renderHost([tag("1", "A")])
      addByName.mockResolvedValue({ data: { skippedContactIds: ["c1"] } })

      await select(["A", "C"])
      await flush()

      expect(toastError).toHaveBeenCalledWith("composerTags.addFailed")
      expect(shown()).toBe("A")
    })
  })
})
