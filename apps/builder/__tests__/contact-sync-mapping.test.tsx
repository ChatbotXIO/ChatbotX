import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContactSyncMapping } from "@/features/contact-sync/components/contact-sync-mapping"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const invalidateQueries = vi.hoisted(() => vi.fn())
const schemaQuery = vi.hoisted(() => ({
  current: {} as { isPending?: boolean; isError?: boolean; data?: unknown },
  options: {} as { input?: unknown },
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { input?: unknown }) => {
    schemaQuery.options = options
    return schemaQuery.current
  },
  useQueryClient: () => ({ invalidateQueries }),
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactSyncAPIs: {
      getSchema: {
        queryOptions: (options: unknown) => options,
        key: () => ["contact-sync-schema"],
      },
    },
  },
}))

vi.mock("@/features/tags/provider/tag-hook", () => ({
  useTags: () => ({
    data: [
      { id: "t1", name: "VIP" },
      { id: "t2", name: "Lead" },
    ],
  }),
}))
vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useCustomFields: () => ({
    data: [
      { id: "cf-text", name: "City", type: "shortText" },
      { id: "cf-num", name: "Age", type: "number" },
    ],
  }),
}))

type ActionOptions = {
  onSuccess?: () => void
  onError?: (args: {
    error: { serverError?: string; validationErrors?: { _errors?: string[] } }
  }) => void
}
const execute = vi.hoisted(() => vi.fn())
const bind = vi.hoisted(() => vi.fn(() => ({})))
const actionState = vi.hoisted(() => ({
  options: {} as ActionOptions,
  isPending: false,
}))
vi.mock("@/features/contact-sync/actions/contact-sync.action", () => ({
  saveContactSyncMappingsAction: { bind },
}))
vi.mock("next-safe-action/hooks", () => ({
  useAction: (_action: unknown, options: ActionOptions) => {
    actionState.options = options
    return { execute, isPending: actionState.isPending }
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))
vi.mock("@chatbotx.io/ui/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))
// A native select per TargetSelect; the trigger's aria-label identifies it.
vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({
    items,
    value,
    onValueChange,
    children,
  }: {
    items: { value: string; label: string }[]
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <div>
      <select
        onChange={(event) => onValueChange(event.target.value)}
        value={value}
      >
        {items.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
      {children}
    </div>
  ),
  SelectTrigger: (props: { "aria-label": string }) => (
    <span data-label={props["aria-label"]} />
  ),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectValue: () => null,
}))

const schema = {
  tags: [
    { id: "st1", name: "src-vip", mapping: null },
    {
      id: "st2",
      name: "src-lead",
      mapping: { tagId: "t2", tagName: "Lead", origin: "manual" },
    },
  ],
  fields: [
    {
      id: "sf1",
      name: "src-city",
      type: "text",
      defaultTargetType: "shortText",
      compatibleTargetTypes: ["shortText", "longText"],
      mapping: {
        customFieldId: "cf-num",
        customFieldName: "Age",
        customFieldType: "number",
        origin: "manual",
        typeMismatch: true,
      },
    },
    {
      id: "sf2",
      name: "src-age",
      type: "number",
      defaultTargetType: "number",
      compatibleTargetTypes: ["number"],
      mapping: {
        customFieldId: "cf-num",
        customFieldName: "Age",
        customFieldType: "number",
        origin: "manual",
        typeMismatch: false,
      },
    },
  ],
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderMapping() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<ContactSyncMapping inboxId="c1" workspaceId="ws-1" />)
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

const selectFor = (el: HTMLElement, label: string) =>
  el
    .querySelector(`[data-label="${label}"]`)
    ?.parentElement?.querySelector("select") as HTMLSelectElement

const optionLabels = (select: HTMLSelectElement) =>
  Array.from(select.options).map((option) => option.textContent)

const choose = (select: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set
  act(() => {
    setter?.call(select, value)
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

const saveButton = (el: HTMLElement) =>
  Array.from(el.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("contactSync.mapping.save"),
  ) as HTMLButtonElement

beforeEach(() => {
  schemaQuery.current = { data: schema }
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
  actionState.isPending = false
  vi.clearAllMocks()
})

describe("ContactSyncMapping", () => {
  test("loads the schema of this connection lazily and binds save to the workspace", () => {
    renderMapping()

    expect(schemaQuery.options.input).toEqual({
      workspaceId: "ws-1",
      inboxId: "c1",
    })
    expect(bind).toHaveBeenCalledWith(null, "ws-1")
  })

  test("shows a spinner while the schema loads and an error if it fails", () => {
    schemaQuery.current = { isPending: true }
    const loading = renderMapping()
    expect(loading.querySelector("svg.animate-spin")).not.toBeNull()

    act(() => root?.unmount())
    loading.remove()
    root = null

    schemaQuery.current = { isError: true }
    const failed = renderMapping()
    expect(failed.textContent).toContain("contactSync.errors.generic")
  })

  test("shows the empty copy when the source has no tags or fields", () => {
    schemaQuery.current = { data: { tags: [], fields: [] } }

    const el = renderMapping()

    expect(el.textContent).toContain("contactSync.mapping.noTags")
    expect(el.textContent).toContain("contactSync.mapping.noFields")
  })

  test("preselects stored mappings and 'auto' for unmapped tags", () => {
    const el = renderMapping()

    expect(selectFor(el, "src-vip").value).toBe("auto")
    expect(selectFor(el, "src-lead").value).toBe("t2")
    expect(optionLabels(selectFor(el, "src-vip"))).toEqual([
      "contactSync.mapping.auto",
      "VIP",
      "Lead",
    ])
  })

  test("offers only workspace fields of a compatible type", () => {
    const el = renderMapping()

    expect(optionLabels(selectFor(el, "src-city"))).toEqual([
      "contactSync.mapping.auto",
      "City",
    ])
    expect(optionLabels(selectFor(el, "src-age"))).toEqual([
      "contactSync.mapping.auto",
      "Age",
    ])
  })

  test("warns about a type mismatch only for the mapping flagged typeMismatch", () => {
    const el = renderMapping()

    const warnings = el.textContent?.match(
      /contactSync\.mapping\.typeMismatch/g,
    )
    expect(warnings).toHaveLength(1)
    // the warning sits in the block of the mismatched field only
    let block: HTMLElement | null = selectFor(el, "src-city")
    while (
      block &&
      !block.textContent?.includes("contactSync.mapping.typeMismatch")
    ) {
      block = block.parentElement
    }
    expect(block?.textContent).toContain("src-city")
    expect(block?.textContent).not.toContain("src-age")
  })

  test("choosing another target clears the mismatch warning", () => {
    const el = renderMapping()

    choose(selectFor(el, "src-city"), "cf-text")

    expect(el.textContent).not.toContain("contactSync.mapping.typeMismatch")
  })

  test("Save is disabled until a mapping is changed, and while saving", () => {
    const el = renderMapping()
    expect(saveButton(el).disabled).toBe(true)

    choose(selectFor(el, "src-vip"), "t1")
    expect(saveButton(el).disabled).toBe(false)

    actionState.isPending = true
    act(() =>
      root?.render(<ContactSyncMapping inboxId="c1" workspaceId="ws-1" />),
    )
    expect(saveButton(el).disabled).toBe(true)
  })

  test("Save sends only the changed rows: ids for chosen targets, null for 'auto'", () => {
    const el = renderMapping()
    choose(selectFor(el, "src-vip"), "t1")
    choose(selectFor(el, "src-lead"), "auto")
    choose(selectFor(el, "src-city"), "cf-text")

    act(() => {
      saveButton(el).click()
    })

    expect(execute).toHaveBeenCalledWith({
      inboxId: "c1",
      tags: [
        { externalId: "st1", target: { tagId: "t1" } },
        { externalId: "st2", target: null },
      ],
      fields: [{ externalId: "sf1", target: { customFieldId: "cf-text" } }],
    })
  })

  test("a saved mapping toasts, refetches the schema and clears the draft", () => {
    const el = renderMapping()
    choose(selectFor(el, "src-vip"), "t1")
    expect(saveButton(el).disabled).toBe(false)

    act(() => {
      actionState.options.onSuccess?.()
    })

    expect(toast.success).toHaveBeenCalledWith("contactSync.mapping.saved")
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["contact-sync-schema"],
    })
    expect(saveButton(el).disabled).toBe(true)
  })

  test("a failed save toasts the validation message, else the server error, else a generic one", () => {
    renderMapping()

    act(() => {
      actionState.options.onError?.({
        error: { validationErrors: { _errors: ["rows invalid"] } },
      })
      actionState.options.onError?.({ error: { serverError: "server" } })
      actionState.options.onError?.({ error: {} })
    })

    expect(toast.error).toHaveBeenNthCalledWith(1, "rows invalid")
    expect(toast.error).toHaveBeenNthCalledWith(2, "server")
    expect(toast.error).toHaveBeenNthCalledWith(3, "contactSync.errors.generic")
  })
})
