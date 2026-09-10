import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useController, useForm } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastFlowTargets } from "@/features/broadcasts/components/broadcast-flow-targets"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

const inboxes = [
  { id: "inbox-a", name: "Shop A" },
  { id: "inbox-b", name: "Shop B" },
]
vi.mock("@/features/inboxes/provider/inbox-store-context", () => ({
  useInboxStore: (selector: (state: { inboxes: typeof inboxes }) => unknown) =>
    selector({ inboxes }),
}))

const flow = (id: string, name: string, templateId: string) => ({
  id,
  name,
  flowVersions: [
    {
      isLatest: true,
      nodes: [
        {
          data: {
            isStartNode: true,
            details: {
              steps: [
                {
                  stepType: "sendWaTemplateMessage",
                  template: { id: templateId },
                },
              ],
            },
          },
        },
      ],
    },
  ],
})
// fa/fb are bound to inbox-a's template; fc is bound to inbox-b's template.
const flows = [
  flow("fa", "Promo A", "tpl-a"),
  flow("fb", "Promo B", "tpl-a"),
  flow("fc", "Promo C", "tpl-b"),
]
vi.mock("@/features/flows/provider/flow-store-context", () => ({
  useFlowStore: (selector: (state: { flows: typeof flows }) => unknown) =>
    selector({ flows }),
}))

const summary = (id: string, inboxId: string) => ({
  id,
  inboxId,
  name: "promo",
  language: "vi",
  status: "APPROVED",
  structureKey: "S1",
})
vi.mock("@/features/broadcasts/hooks/use-broadcast-page-templates", () => ({
  useBroadcastPageTemplates: () => ({
    templates: [summary("tpl-a", "inbox-a"), summary("tpl-b", "inbox-b")],
    templatesById: new Map([
      ["tpl-a", summary("tpl-a", "inbox-a")],
      ["tpl-b", summary("tpl-b", "inbox-b")],
    ]),
    isLoading: false,
    refetch: async () => undefined,
  }),
}))

vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: ({
    name,
    options,
  }: {
    name: string
    options: { label: string; value: string }[]
  }) => {
    const { field } = useController({ name })
    return (
      <select
        data-testid={name}
        onChange={(e) => field.onChange(e.target.value)}
        value={field.value ?? ""}
      >
        <option value="">-</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  },
}))

type FormValues = {
  inboxIds: string[]
  targets: { inboxId: string; flowId?: string }[]
}

let container: HTMLDivElement | null = null
let root: Root | null = null
let readValues: (() => FormValues) | null = null

function Harness({
  defaultValues,
  children,
}: {
  defaultValues: FormValues
  children: React.ReactNode
}) {
  const form = useForm<FormValues>({ defaultValues })
  readValues = () => form.getValues()
  return <FormProvider {...form}>{children}</FormProvider>
}

function render(defaultValues: FormValues) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <Harness defaultValues={defaultValues}>
        <BroadcastFlowTargets channel="whatsapp" />
      </Harness>,
    )
  })
  return container
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  readValues = null
})

describe("BroadcastFlowTargets", () => {
  test("renders one card per selected page", () => {
    const el = render({
      inboxIds: ["inbox-a", "inbox-b"],
      targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
    })

    expect(el.textContent).toContain("Shop A")
    expect(el.textContent).toContain("Shop B")
    expect(el.querySelectorAll('[data-testid$=".flowId"]').length).toBe(2)
  })

  test("picking a flow on one page does not touch the other page's target", () => {
    const el = render({
      inboxIds: ["inbox-a", "inbox-b"],
      targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
    })

    const pageAField = el.querySelector(
      '[data-testid="targets.0.flowId"]',
    ) as HTMLSelectElement
    act(() => {
      pageAField.value = "fa"
      pageAField.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(readValues?.().targets).toEqual([
      { inboxId: "inbox-a", flowId: "fa" },
      { inboxId: "inbox-b" },
    ])
  })

  test("a page left without a flow is allowed", () => {
    render({
      inboxIds: ["inbox-a", "inbox-b"],
      targets: [{ inboxId: "inbox-a", flowId: "fa" }, { inboxId: "inbox-b" }],
    })

    expect(readValues?.().targets).toEqual([
      { inboxId: "inbox-a", flowId: "fa" },
      { inboxId: "inbox-b" },
    ])
  })

  test("each page's picker offers only that page's flows", () => {
    const el = render({
      inboxIds: ["inbox-a", "inbox-b"],
      targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
    })

    const pageAField = el.querySelector(
      '[data-testid="targets.0.flowId"]',
    ) as HTMLSelectElement
    const pageBField = el.querySelector(
      '[data-testid="targets.1.flowId"]',
    ) as HTMLSelectElement

    const pageAOptions = Array.from(pageAField.options).map((o) => o.value)
    const pageBOptions = Array.from(pageBField.options).map((o) => o.value)

    expect(pageAOptions).toEqual(["", "fa", "fb"])
    expect(pageBOptions).toEqual(["", "fc"])
  })

  test("deselecting a page drops its card", () => {
    const el = render({
      inboxIds: ["inbox-a"],
      targets: [{ inboxId: "inbox-a", flowId: "fa" }],
    })

    expect(el.querySelectorAll('[data-testid$=".flowId"]').length).toBe(1)
  })

  test("edit-draft reopens each page with its saved flow", () => {
    const el = render({
      inboxIds: ["inbox-a", "inbox-b"],
      targets: [
        { inboxId: "inbox-a", flowId: "fa" },
        { inboxId: "inbox-b", flowId: "fc" },
      ],
    })

    const pageAField = el.querySelector(
      '[data-testid="targets.0.flowId"]',
    ) as HTMLSelectElement
    const pageBField = el.querySelector(
      '[data-testid="targets.1.flowId"]',
    ) as HTMLSelectElement

    expect(pageAField.value).toBe("fa")
    expect(pageBField.value).toBe("fc")
  })
})
