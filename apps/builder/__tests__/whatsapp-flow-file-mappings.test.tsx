// @vitest-environment jsdom

import type { WhatsappFlowFieldMapping } from "@chatbotx.io/flow-config"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useForm,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const getScreens = vi.hoisted(() => vi.fn())

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    whatsappFlowAPIs: { getWhatsappFlowScreensInternalAPI: getScreens },
  },
}))
vi.mock(
  "@/features/flows/react-flow/stores/whatsapp-flow-store-provider",
  () => ({
    useWhatsappFlow: (
      select: (state: {
        whatsappFlows: unknown[]
        loadingWhatsappFlows: boolean
      }) => unknown,
    ) =>
      select({
        loadingWhatsappFlows: false,
        whatsappFlows: [
          {
            id: "11612473309626368",
            sourceId: "meta-flow-1",
            name: "Upload flow",
            status: "PUBLISHED",
            integrationWhatsapp: { inboxId: "inbox-1" },
          },
        ],
      }),
  }),
)
vi.mock("@/features/custom-fields/custom-field-select", () => ({
  CustomFieldSelect: (props: { name: string; customFieldTypes?: string[] }) => (
    <div
      data-name={props.name}
      data-testid="custom-field-select"
      data-types={JSON.stringify(props.customFieldTypes ?? null)}
    />
  ),
}))
vi.mock("@/features/custom-fields/create-custom-field", () => ({
  CreateCustomFieldDialog: () => null,
}))
// "111" is a number field, "222" a text field, "333" another number field.
vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useInvalidateCustomFields: () => () => undefined,
  useCustomFields: () => ({
    data: [
      { id: "111", type: "number" },
      { id: "222", type: "shortText" },
      { id: "333", type: "number" },
    ],
  }),
}))
vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: () => null,
}))
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: (props: { name: string }) => (
    <div data-name={props.name} data-testid="select-field" />
  ),
}))
// Renders only its form item, so a test can see whether it takes room.
vi.mock("@chatbotx.io/ui/components/form/input-field", () => ({
  InputField: ({
    name,
    formItemClassName,
  }: {
    name: string
    formItemClassName?: string
  }) => (
    <div className={formItemClassName} data-name={name} data-slot="form-item" />
  ),
}))
// The real dialog portals through Base UI; rendering its children inline keeps
// the assertions on what the dialog shows, not how it mounts.
vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: () => null,
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogClose: ({ render }: { render: ReactNode }) => render,
}))

const { FlowDialog } = await import(
  "@/features/flows/react-flow/steps/whatsapp-flow/components/flow-dialog"
)
const { TemplateFlowFieldMappings } = await import(
  "@/features/integration-whatsapp/message-templates/components/template-params-form"
)

const FILE_FORMAT_NAME = /^(.*)\.fileFormat$/

const screens = [
  {
    id: "UPLOAD",
    title: "Upload",
    terminal: true,
    output: [
      { value: "name", label: "Name", kind: "value" },
      { value: "docs", label: "Documents", kind: "file" },
    ],
  },
]

const mappings = (): WhatsappFlowFieldMapping[] => [
  { paramKey: "name", paramLabel: "Name", customFieldId: "111" },
  {
    paramKey: "docs",
    paramLabel: "Documents",
    customFieldId: "222",
    fileFormat: "firstUrl",
  },
]

let container: HTMLDivElement
let root: Root
let parentForm: UseFormReturn<FieldValues>

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  getScreens.mockReset()
  getScreens.mockResolvedValue({ screens })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const settle = async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
}

const fileFormatFieldNames = () =>
  Array.from(container.querySelectorAll("[data-testid=select-field]"))
    .map((element) => element.getAttribute("data-name") ?? "")
    .filter((name) => FILE_FORMAT_NAME.test(name))

const customFieldTypesByName = () =>
  new Map(
    Array.from(
      container.querySelectorAll("[data-testid=custom-field-select]"),
    ).map((element) => [
      element.getAttribute("data-name"),
      element.getAttribute("data-types"),
    ]),
  )

const clickButton = async (text: string) => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.includes(text),
  )
  if (!button) {
    throw new Error(`No button "${text}"`)
  }
  await act(() => {
    button.click()
  })
}

describe("WhatsApp Flow step dialog — file answers", () => {
  // The dialog caches a flow's screens, so every test uses a flow id of its own.
  let nextFlowId = 11_612_473_309_626_400n

  const renderDialog = async (
    fieldMappings: WhatsappFlowFieldMapping[] = mappings(),
  ) => {
    nextFlowId += 1n
    const flowId = nextFlowId.toString()
    const Harness = () => {
      parentForm = useForm<FieldValues>({
        defaultValues: {
          step: {
            inboxId: "inbox-1",
            buttons: [{ label: "Open form" }],
            flow: {
              id: flowId,
              sourceId: "meta-flow-1",
              startScreenId: "UPLOAD",
              fieldMappings,
            },
          },
        },
      })
      return (
        <FormProvider {...parentForm}>
          <FlowDialog onOpenChange={() => undefined} open parentName="step" />
        </FormProvider>
      )
    }
    act(() => {
      root.render(<Harness />)
    })
    await settle()
  }

  test("only the file answer gets the badge, the format select and text-only fields", async () => {
    await renderDialog()

    expect(
      container.textContent?.split("flows.whatsappFlow.fileBadge").length,
    ).toBe(2)
    expect(fileFormatFieldNames()).toEqual(["flow.fieldMappings.1.fileFormat"])
    const types = customFieldTypesByName()
    expect(types.get("flow.fieldMappings.0.customFieldId")).toBe("null")
    expect(types.get("flow.fieldMappings.1.customFieldId")).toBe(
      JSON.stringify(["shortText", "longText"]),
    )
  })

  test("the hidden answer-key fields take no room in their row", async () => {
    await renderDialog()

    const keyFields = Array.from(
      container.querySelectorAll(
        '[data-slot="form-item"][data-name$=".paramKey"]',
      ),
    )
    expect(keyFields.length).toBeGreaterThan(0)
    expect(keyFields.every((field) => field.classList.contains("hidden"))).toBe(
      true,
    )
  })

  test("saving keeps the format the user chose and adds none to other answers", async () => {
    // Labels come from the screens, so a rewritten label proves the save ran.
    getScreens.mockResolvedValue({
      screens: [
        {
          ...screens[0],
          output: [
            { value: "name", label: "Full name", kind: "value" },
            { value: "docs", label: "Documents (new)", kind: "file" },
          ],
        },
      ],
    })
    await renderDialog()

    await clickButton("actions.save")
    await settle()

    expect(parentForm.getValues("step.flow.fieldMappings")).toEqual([
      { paramKey: "name", paramLabel: "Full name", customFieldId: "111" },
      {
        paramKey: "docs",
        paramLabel: "Documents (new)",
        customFieldId: "222",
        fileFormat: "firstUrl",
      },
    ])
  })

  test("a file answer saved to a non-text field keeps it (the worker skips the write)", async () => {
    await renderDialog([
      { paramKey: "name", paramLabel: "Name", customFieldId: "111" },
      {
        paramKey: "docs",
        paramLabel: "Documents",
        customFieldId: "333",
        fileFormat: "firstUrl",
      },
    ])

    await clickButton("actions.save")
    await settle()

    expect(parentForm.getValues("step.flow.fieldMappings")).toEqual([
      { paramKey: "name", paramLabel: "Name", customFieldId: "111" },
      {
        paramKey: "docs",
        paramLabel: "Documents",
        customFieldId: "333",
        fileFormat: "firstUrl",
      },
    ])
  })

  test("a flow without file answers shows no file controls", async () => {
    getScreens.mockResolvedValue({
      screens: [
        {
          ...screens[0],
          output: [{ value: "name", label: "Name", kind: "value" }],
        },
      ],
    })

    await renderDialog()

    expect(container.textContent).not.toContain("flows.whatsappFlow.fileBadge")
    expect(fileFormatFieldNames()).toEqual([])
  })

  test("a saved file mapping without a format gets the default", async () => {
    // As saved before file answers had a format.
    await renderDialog([
      { paramKey: "name", paramLabel: "Name", customFieldId: "111" },
      { paramKey: "docs", paramLabel: "Documents", customFieldId: "222" },
    ])

    await clickButton("actions.save")
    await settle()

    expect(parentForm.getValues("step.flow.fieldMappings")).toEqual([
      { paramKey: "name", paramLabel: "Name", customFieldId: "111" },
      {
        paramKey: "docs",
        paramLabel: "Documents",
        customFieldId: "222",
        fileFormat: "allUrls",
      },
    ])
  })
})

describe("template FLOW button mappings — file answers", () => {
  const param = {
    sub_type: "flow" as const,
    index: 0,
    flowSourceId: "meta-flow-1",
    navigateScreenId: "UPLOAD",
  }

  const Harness = ({ initial }: { initial: WhatsappFlowFieldMapping[] }) => {
    parentForm = useForm<FieldValues>({
      defaultValues: { param: { fieldMappings: initial } },
    })
    return (
      <FormProvider {...parentForm}>
        <TemplateFlowFieldMappings fieldName="param" param={param as never} />
      </FormProvider>
    )
  }

  const renderForm = async (initial: WhatsappFlowFieldMapping[]) => {
    act(() => {
      root.render(<Harness initial={initial} />)
    })
    await settle()
    await clickButton("Upload flow")
    await settle()
  }

  test("only the file answer gets the badge, the format select and text-only fields", async () => {
    await renderForm(mappings())

    expect(
      container.textContent?.split("flows.whatsappFlow.fileBadge").length,
    ).toBe(2)
    expect(fileFormatFieldNames()).toEqual(["param.fieldMappings.1.fileFormat"])
    const types = customFieldTypesByName()
    expect(types.get("param.fieldMappings.0.customFieldId")).toBe("null")
    expect(types.get("param.fieldMappings.1.customFieldId")).toBe(
      JSON.stringify(["shortText", "longText"]),
    )
  })

  test("re-syncing with the Flow keeps the chosen format and adds none elsewhere", async () => {
    await renderForm(mappings())

    expect(parentForm.getValues("param.fieldMappings")).toEqual([
      { paramKey: "name", paramLabel: "Name", customFieldId: "111" },
      {
        paramKey: "docs",
        paramLabel: "Documents",
        customFieldId: "222",
        fileFormat: "firstUrl",
      },
    ])
  })

  test("a file answer saved to a non-text field keeps it", async () => {
    await renderForm([
      { paramKey: "name", paramLabel: "Name", customFieldId: "111" },
      { paramKey: "docs", paramLabel: "Documents", customFieldId: "333" },
    ])

    expect(parentForm.getValues("param.fieldMappings")).toMatchObject([
      { paramKey: "name", customFieldId: "111" },
      { paramKey: "docs", customFieldId: "333" },
    ])
  })

  test("a file answer saved without a format starts with the default", async () => {
    await renderForm([
      { paramKey: "docs", paramLabel: "Documents", customFieldId: "222" },
    ])

    expect(parentForm.getValues("param.fieldMappings.1")).toMatchObject({
      paramKey: "docs",
      fileFormat: "allUrls",
    })
  })
})
