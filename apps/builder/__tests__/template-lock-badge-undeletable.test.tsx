// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"

const page = vi.hoisted(() => ({
  value: {} as { lockedIds: string[]; undeletableIds: string[] },
}))

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    templatesAPI: {
      listLockedIdsAPI: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["locked-ids", input],
          queryFn: () => Promise.resolve(page.value),
        }),
      },
    },
  },
}))

const {
  LockedGuard,
  TemplateLockedList,
  UndeletableGuard,
  useIsLocked,
  useIsUndeletable,
} = await import("@/features/templates/components/lock-context")

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function Row({ id }: { id: string }) {
  const locked = useIsLocked(id)
  return (
    <UndeletableGuard resourceId={id}>
      {(disabled) => (
        <>
          <button
            data-locked={locked}
            disabled={disabled}
            id={id}
            type="button"
          >
            Delete
          </button>
          <LockedGuard resourceId={id}>
            {(renameDisabled) => (
              <button
                disabled={renameDisabled}
                id={`${id}-rename`}
                type="button"
              >
                Rename
              </button>
            )}
          </LockedGuard>
        </>
      )}
    </UndeletableGuard>
  )
}

let root: Root | undefined
let container: HTMLDivElement | undefined

const render = async () => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  const client = new QueryClient()
  act(() => {
    root?.render(
      <QueryClientProvider client={client}>
        <TemplateLockedList
          resourceKind="flow"
          rows={[{ id: "a" }, { id: "b" }]}
          workspaceId="ws-1"
        >
          <Row id="a" />
          <Row id="b" />
        </TemplateLockedList>
      </QueryClientProvider>,
    )
  })
  // Every case locks row "a": wait until its lock arrived instead of a fixed
  // tick, which a slow CI runner does not always give the query.
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(button("a")?.dataset.locked).toBe("true")
  })
}

const button = (id: string) =>
  container?.querySelector<HTMLButtonElement>(`#${id}`)

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
})

describe("Delete on rows whose template does not allow deleting", () => {
  test("is disabled only on those rows", async () => {
    page.value = { lockedIds: ["a"], undeletableIds: ["a"] }

    await render()

    expect(button("a")?.disabled).toBe(true)
    expect(button("b")?.disabled).toBe(false)
  })
})

describe("Rename and duplicate on View-only rows", () => {
  test("are disabled only on locked rows, whatever the delete permission", async () => {
    page.value = { lockedIds: ["a"], undeletableIds: ["b"] }

    await render()

    expect(button("a-rename")?.disabled).toBe(true)
    expect(button("b-rename")?.disabled).toBe(false)
  })
})

describe("a list page that forgot the provider", () => {
  test("warns once in development and disables nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    function Orphan() {
      return (
        <span
          data-locked={String(useIsLocked("x"))}
          data-undeletable={String(useIsUndeletable("x"))}
          id="orphan"
        />
      )
    }
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root?.render(
        <>
          <Orphan />
          <Orphan />
        </>,
      )
    })

    const el = container.querySelector<HTMLElement>("#orphan")
    expect(el?.dataset.locked).toBe("false")
    expect(el?.dataset.undeletable).toBe("false")
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})
