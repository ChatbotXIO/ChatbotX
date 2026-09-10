import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useController, useForm, useWatch } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastTargetCard } from "@/features/broadcasts/components/broadcast-target-card"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// Deterministic seeds so the assertions read the exact params the card wrote.
vi.mock("@chatbotx.io/flow-config", () => ({
  extractTemplateParams: () => ({ body: [{ type: "text", text: "" }] }),
  extractMessengerTemplateParams: () => ({ body: [] }),
  extractMessengerFlowButtons: () => [{ id: "btn-1", label: "Go" }],
}))

const whatsappTemplates = [
  {
    id: "tpl-a",
    name: "promo",
    language: "vi",
    status: "APPROVED",
    components: [],
    integrationWhatsapp: { inboxId: "inbox-a" },
  },
  {
    id: "tpl-b",
    name: "welcome",
    language: "en",
    status: "APPROVED",
    components: [],
    integrationWhatsapp: { inboxId: "inbox-b" },
  },
  {
    id: "tpl-pending",
    name: "pending",
    language: "vi",
    status: "PENDING",
    components: [],
    integrationWhatsapp: { inboxId: "inbox-a" },
  },
]
const messengerTemplates = [
  {
    id: "mtpl-a",
    name: "sale",
    language: "vi",
    status: "APPROVED",
    parameterFormat: "POSITIONAL",
    components: [],
    integrationMessenger: { inboxId: "inbox-a" },
  },
]

vi.mock(
  "@/features/flows/react-flow/stores/flow-template-store-provider",
  () => ({
    useFlowTemplate: (
      selector: (state: {
        whatsappTemplates: typeof whatsappTemplates
        messengerTemplates: typeof messengerTemplates
      }) => unknown,
    ) => selector({ whatsappTemplates, messengerTemplates }),
  }),
)

// A native select bound to the form so a change event drives the real
// react-hook-form state the card reacts to.
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
        onChange={(event) => field.onChange(event.target.value)}
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

vi.mock(
  "@/features/integration-whatsapp/message-templates/components/template-params-form",
  () => ({
    TemplateParamsForm: ({ parentName }: { parentName: string }) => (
      <div data-testid="wa-params">{parentName}</div>
    ),
  }),
)
vi.mock(
  "@/features/integration-whatsapp/message-templates/components/template-preview",
  () => ({ TemplatePreview: () => <div data-testid="wa-preview" /> }),
)
vi.mock(
  "@/features/integration-messenger/message-templates/components/template-params-form",
  () => ({
    MessengerTemplateParamsForm: ({ parentName }: { parentName: string }) => (
      <div data-testid="messenger-params">{parentName}</div>
    ),
  }),
)
vi.mock(
  "@/features/integration-messenger/message-templates/components/template-preview",
  () => ({
    MessengerTemplatePreview: () => <div data-testid="messenger-preview" />,
  }),
)
vi.mock(
  "@/features/broadcasts/components/messenger-broadcast-flow-buttons",
  () => ({
    MessengerBroadcastFlowButtons: ({ name }: { name: string }) => {
      const buttons = useWatch({ name }) as { label: string }[] | undefined
      return (
        <div data-testid="flow-buttons">
          {name}:{(buttons ?? []).map((button) => button.label).join(",")}
        </div>
      )
    },
  }),
)

type FormValues = {
  targets: {
    inboxId: string
    templateId?: string
    templateData?: unknown
    buttons?: unknown[]
  }[]
}

let container: HTMLDivElement | null = null
let root: Root | null = null
let formValues: (() => FormValues) | null = null

function Harness({
  defaultValues,
  children,
}: {
  defaultValues: FormValues
  children: React.ReactNode
}) {
  const form = useForm<FormValues>({ defaultValues })
  formValues = () => form.getValues()
  return <FormProvider {...form}>{children}</FormProvider>
}

function renderCard(
  defaultValues: FormValues,
  card: React.ReactElement,
): HTMLDivElement {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<Harness defaultValues={defaultValues}>{card}</Harness>)
  })
  return container
}

function selectTemplate(el: HTMLElement, fieldName: string, value: string) {
  const select = el.querySelector(
    `[data-testid="${fieldName}.templateId"]`,
  ) as HTMLSelectElement
  act(() => {
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
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
  formValues = null
})

describe("BroadcastTargetCard", () => {
  test("offers only the page's own WhatsApp templates, labelled with the page name", () => {
    const el = renderCard(
      { targets: [{ inboxId: "inbox-a" }] },
      <BroadcastTargetCard
        channel="whatsapp"
        fieldName="targets.0"
        inboxId="inbox-a"
        inboxName="Shop A"
        subaction="whatsappTemplateMessage"
      />,
    )

    const labels = Array.from(
      el.querySelectorAll('[data-testid="targets.0.templateId"] option'),
    ).map((option) => option.textContent)
    // The page's pending template is not offered: only approved ones can be sent.
    expect(labels).toEqual(["-", "Shop A - promo (vi)"])
    expect(el.textContent).toContain("Shop A")
    expect(el.querySelector('[data-testid="wa-params"]')).toBeNull()
  })

  test("seeds the page's params under its own form path when a template is picked", () => {
    const el = renderCard(
      { targets: [{ inboxId: "inbox-a" }] },
      <BroadcastTargetCard
        channel="whatsapp"
        fieldName="targets.0"
        inboxId="inbox-a"
        inboxName="Shop A"
        subaction="whatsappTemplateMessage"
      />,
    )

    selectTemplate(el, "targets.0", "tpl-a")

    expect(formValues?.().targets[0]).toMatchObject({
      inboxId: "inbox-a",
      templateId: "tpl-a",
      templateData: { body: [{ type: "text", text: "" }] },
      buttons: [],
    })
    expect(el.querySelector('[data-testid="wa-params"]')?.textContent).toBe(
      "targets.0.templateData",
    )
    expect(el.querySelector('[data-testid="wa-preview"]')).not.toBeNull()
  })

  test("keeps the params a reopened draft was saved with instead of re-seeding them", () => {
    const savedParams = { body: [{ type: "text", text: "Ada" }] }
    renderCard(
      {
        targets: [
          {
            inboxId: "inbox-a",
            templateId: "tpl-a",
            templateData: savedParams,
          },
        ],
      },
      <BroadcastTargetCard
        channel="whatsapp"
        fieldName="targets.0"
        hydratedTemplateId="tpl-a"
        inboxId="inbox-a"
        inboxName="Shop A"
        subaction="whatsappTemplateMessage"
      />,
    )

    expect(formValues?.().targets[0].templateData).toEqual(savedParams)
  })

  test("ignores a template id that belongs to another page", () => {
    const el = renderCard(
      { targets: [{ inboxId: "inbox-a", templateId: "tpl-b" }] },
      <BroadcastTargetCard
        channel="whatsapp"
        fieldName="targets.0"
        inboxId="inbox-a"
        inboxName="Shop A"
        subaction="whatsappTemplateMessage"
      />,
    )

    expect(el.querySelector('[data-testid="wa-params"]')).toBeNull()
    expect(formValues?.().targets[0].templateData).toBeUndefined()
  })

  test("seeds Messenger params and flow-button bindings under the page's path", () => {
    const el = renderCard(
      { targets: [{ inboxId: "inbox-a" }] },
      <BroadcastTargetCard
        channel="messenger"
        fieldName="targets.0"
        inboxId="inbox-a"
        inboxName="Page A"
        subaction="messengerTemplateMessage"
      />,
    )

    selectTemplate(el, "targets.0", "mtpl-a")

    expect(formValues?.().targets[0]).toMatchObject({
      templateId: "mtpl-a",
      templateData: { body: [] },
      buttons: [{ id: "btn-1", label: "Go", flowId: "" }],
    })
    expect(
      el.querySelector('[data-testid="messenger-params"]')?.textContent,
    ).toBe("targets.0.templateData")
    expect(el.querySelector('[data-testid="flow-buttons"]')?.textContent).toBe(
      "targets.0.buttons:Go",
    )
  })

  test("hides the picker and shows the group title when the template is fixed by the selection", () => {
    const el = renderCard(
      { targets: [{ inboxId: "inbox-a", templateId: "tpl-a" }] },
      <BroadcastTargetCard
        channel="whatsapp"
        fieldName="targets.0"
        inboxId="inbox-a"
        inboxName="Shop A"
        subaction="whatsappTemplateMessage"
        templatePickerHidden
        title="Shop A, Shop B"
      />,
    )

    expect(el.querySelector('[data-testid="targets.0.templateId"]')).toBeNull()
    expect(el.textContent).toContain("Shop A, Shop B")
    expect(el.querySelector('[data-testid="wa-params"]')).not.toBeNull()
  })

  test("renders nothing for a channel without a template picker", () => {
    const el = renderCard(
      { targets: [{ inboxId: "inbox-a" }] },
      <BroadcastTargetCard
        channel="telegram"
        fieldName="targets.0"
        inboxId="inbox-a"
        inboxName="Bot"
        subaction="telegramAllContacts"
      />,
    )

    expect(el.innerHTML).toBe("")
  })
})
