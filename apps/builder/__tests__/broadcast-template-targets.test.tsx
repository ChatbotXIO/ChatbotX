import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  FormProvider,
  type UseFormReturn,
  useController,
  useForm,
  useWatch,
} from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastTemplateTargets } from "@/features/broadcasts/components/broadcast-template-targets"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

const inboxes = [
  { id: "inbox-a", name: "Shop A" },
  { id: "inbox-b", name: "Shop B" },
  { id: "inbox-c", name: "Shop C" },
]
vi.mock("@/features/inboxes/provider/inbox-store-context", () => ({
  useInboxStore: (selector: (state: { inboxes: typeof inboxes }) => unknown) =>
    selector({ inboxes }),
}))

// The card is exercised by its own suite; here it only has to expose which
// form path it binds to and let a test change its own templateId.
vi.mock("@/features/broadcasts/components/broadcast-target-card", () => ({
  BroadcastTargetCard: ({
    fieldName,
    inboxName,
    hydratedTemplateId,
  }: {
    fieldName: string
    inboxName?: string
    hydratedTemplateId?: string
  }) => {
    const { field } = useController({ name: `${fieldName}.templateId` })
    return (
      <div data-field={fieldName} data-testid="card">
        <span data-testid="card-title">{inboxName}</span>
        <span data-testid={`${fieldName}.hydrated`}>{hydratedTemplateId}</span>
        <button
          data-testid={`${fieldName}.pick`}
          onClick={() => field.onChange("tpl-1")}
          type="button"
        >
          pick
        </button>
      </div>
    )
  },
}))

type FormValues = {
  inboxIds: string[]
  targets: {
    inboxId: string
    templateId?: string
    templateData?: unknown
    buttons?: unknown[]
  }[]
}

let container: HTMLDivElement | null = null
let root: Root | null = null
let readValues: (() => FormValues) | null = null
let formApi: UseFormReturn<FormValues> | null = null

function Harness({
  defaultValues,
  children,
}: {
  defaultValues: FormValues
  children: React.ReactNode
}) {
  const form = useForm<FormValues>({ defaultValues })
  readValues = () => form.getValues()
  formApi = form
  const targets = useWatch({ control: form.control, name: "targets" })
  return (
    <FormProvider {...form}>
      {children}
      <pre data-testid="targets">{JSON.stringify(targets)}</pre>
    </FormProvider>
  )
}

function render(defaultValues: FormValues, ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<Harness defaultValues={defaultValues}>{ui}</Harness>)
  })
  return container
}

const click = (el: HTMLElement, testId: string) => {
  act(() => {
    ;(
      el.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement
    ).click()
  })
}
const targetsOf = () => readValues?.().targets ?? []

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
  formApi = null
})

describe("BroadcastTemplateTargets", () => {
  test("renders one independent card per selected page", () => {
    const el = render(
      {
        inboxIds: ["inbox-a", "inbox-b"],
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      },
      <BroadcastTemplateTargets
        channel="messenger"
        subaction="messengerTemplateMessage"
      />,
    )

    const cards = Array.from(el.querySelectorAll('[data-testid="card"]'))
    expect(cards.map((c) => c.getAttribute("data-field"))).toEqual([
      "targets.0",
      "targets.1",
    ])
    const titles = Array.from(
      el.querySelectorAll('[data-testid="card-title"]'),
    ).map((n) => n.textContent)
    expect(titles).toEqual(["Shop A", "Shop B"])
  })

  test("picking a template on one page does not affect another page's card", () => {
    render(
      {
        inboxIds: ["inbox-a", "inbox-b"],
        targets: [{ inboxId: "inbox-a" }, { inboxId: "inbox-b" }],
      },
      <BroadcastTemplateTargets
        channel="messenger"
        subaction="messengerTemplateMessage"
      />,
    )
    const el = container as HTMLDivElement

    click(el, "targets.0.pick")

    expect(targetsOf().map((t) => t.templateId)).toEqual(["tpl-1", undefined])
  })

  test("a page left without a template is allowed and still renders its own empty card", () => {
    const el = render(
      {
        inboxIds: ["inbox-a", "inbox-b", "inbox-c"],
        targets: [
          { inboxId: "inbox-a", templateId: "tpl-1" },
          { inboxId: "inbox-b" },
          { inboxId: "inbox-c" },
        ],
      },
      <BroadcastTemplateTargets
        channel="messenger"
        subaction="messengerTemplateMessage"
      />,
    )

    expect(el.querySelectorAll('[data-testid="card"]')).toHaveLength(3)
    expect(targetsOf().map((t) => t.templateId)).toEqual([
      "tpl-1",
      undefined,
      undefined,
    ])
  })

  test("an edit-draft reopens each page with its own saved template", () => {
    const saved = [
      { inboxId: "inbox-a", templateId: "tpl-1" },
      { inboxId: "inbox-b", templateId: "tpl-2" },
    ]
    const el = render(
      {
        inboxIds: ["inbox-a", "inbox-b"],
        targets: saved,
      },
      <BroadcastTemplateTargets
        channel="messenger"
        hydratedTargets={saved}
        subaction="messengerTemplateMessage"
      />,
    )

    expect(
      el.querySelector('[data-testid="targets.0.hydrated"]')?.textContent,
    ).toBe("tpl-1")
    expect(
      el.querySelector('[data-testid="targets.1.hydrated"]')?.textContent,
    ).toBe("tpl-2")
  })

  test("deselecting a page drops its card once `targets` is resynced", () => {
    const el = render(
      {
        inboxIds: ["inbox-a"],
        targets: [{ inboxId: "inbox-a" }],
      },
      <BroadcastTemplateTargets
        channel="messenger"
        subaction="messengerTemplateMessage"
      />,
    )

    expect(el.querySelectorAll('[data-testid="card"]')).toHaveLength(1)

    // Simulate the parent form's sync effect deselecting the page: `inboxIds`
    // no longer lists it, and `targets` no longer holds a row for it.
    act(() => {
      formApi?.setValue("inboxIds", [])
      formApi?.setValue("targets", [])
    })

    expect(el.querySelectorAll('[data-testid="card"]')).toHaveLength(0)
  })
})
