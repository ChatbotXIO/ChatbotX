// @vitest-environment jsdom

import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  data: { current: undefined as { data: SelectOption[] } | undefined },
  formValue: { current: [] as string[] },
  lastProps: { current: undefined as Record<string, unknown> | undefined },
  queryInputs: [] as unknown[],
}))

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("react-hook-form", () => ({
  useFormContext: () => ({ watch: () => mocks.formValue.current }),
}))
vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: (options: { input?: unknown } & Record<string, unknown>) => {
    mocks.queryInputs.push(options)
    return {
      data: mocks.data.current,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }
  },
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactFilterAPI: {
      listActivityValueOptionsAPI: {
        queryOptions: (options: Record<string, unknown>) => options,
      },
    },
  },
}))
vi.mock("@chatbotx.io/ui/components/form/multi-select-field", () => ({
  MultiSelectField: (props: Record<string, unknown>) => {
    mocks.lastProps.current = props
    return null
  },
}))

const { ActivityReferenceValueField } = await import(
  "../src/features/contact-filter/components/activity-reference-value-field"
)

const option = (value: string, label = value): SelectOption => ({
  label,
  value,
})

describe("ActivityReferenceValueField", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async (
    props: Parameters<typeof ActivityReferenceValueField>[0],
  ) => {
    await act(() => {
      root.render(<ActivityReferenceValueField {...props} />)
    })
  }
  const shownValues = () =>
    (mocks.lastProps.current?.options as SelectOption[]).map((o) => o.value)

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    mocks.data.current = undefined
    mocks.formValue.current = []
    mocks.lastProps.current = undefined
    mocks.queryInputs.length = 0
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  test("lists the fixed choices first, then the searched page", async () => {
    mocks.data.current = { data: [option("1", "Newsletter")] }

    await render({
      fixedOptions: [option("noTopic", "No Topic")],
      source: "emailTopics",
    })

    expect(shownValues()).toEqual(["noTopic", "1"])
  })

  test("keeps a chosen value in the list after the search moves on", async () => {
    mocks.data.current = { data: [option("1", "Newsletter"), option("2")] }
    await render({ source: "emailTopics" })

    // The user picked topic 1, then searched for something else.
    mocks.formValue.current = ["1"]
    mocks.data.current = { data: [option("3", "Promo")] }
    await render({ source: "emailTopics" })

    expect(shownValues()).toContain("1")
    expect(shownValues()).toContain("3")
  })

  test("names values that were saved earlier from the looked-up labels", async () => {
    mocks.formValue.current = ["9"]
    mocks.data.current = { data: [] }

    await render({
      selectedOptions: [option("9", "Old rule")],
      source: "keywords",
    })

    expect(shownValues()).toEqual(["9"])
  })

  test("searches on the server and never serves a stale page", async () => {
    await render({ source: "keywords" })

    expect(mocks.lastProps.current?.serverSearch).toBe(true)
    const query = mocks.queryInputs.at(-1) as {
      input: { source: string; workspaceId: string }
      staleTime: number
    }
    expect(query.input).toMatchObject({
      source: "keywords",
      workspaceId: "ws-1",
    })
    expect(query.staleTime).toBe(0)
  })
})
