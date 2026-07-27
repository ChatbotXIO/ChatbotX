// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import SendTextStepEditor from "../send-text/editor"
import WhatsappFlowStepEditor from "../whatsapp-flow/editor"

const tiptapEditorFieldMock = vi.fn()

vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: (props: {
    includeCouponVariables?: boolean
    name: string
  }) => {
    tiptapEditorFieldMock(props)
    return (
      <div
        data-include-coupon-variables={String(
          Boolean(props.includeCouponVariables),
        )}
        data-testid={`tiptap-${props.name}`}
      />
    )
  },
}))

vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useWhatsappInboxOptions: () => [],
}))

vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: () => <select data-testid="combobox-field" />,
}))

vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: () => <select data-testid="select-field" />,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock("../button/editor", () => ({
  ButtonGroupEditor: () => <div data-testid="button-group-editor" />,
}))

vi.mock("../../stores/whatsapp-flow-store-provider", () => ({
  useWhatsappFlow: (
    selector: (state: { whatsappFlows: unknown[] }) => unknown,
  ) => selector({ whatsappFlows: [] }),
}))

vi.mock("../whatsapp-flow/components/flow-dialog", () => ({
  FlowDialog: () => <div data-testid="flow-dialog" />,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  tiptapEditorFieldMock.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

const render = (ui: ReactNode) => {
  act(() => {
    root.render(<Harness>{ui}</Harness>)
  })
}

const Harness = ({ children }: { children: ReactNode }) => {
  const form = useForm({
    defaultValues: {
      step: {
        buttons: [{ label: "Continue" }],
        flow: {
          fieldMappings: [],
          id: null,
          startScreenId: null,
        },
        inboxId: "inbox-1",
        text: "",
      },
    },
  })

  return <FormProvider {...form}>{children}</FormProvider>
}

describe("flow message coupon variables", () => {
  test("enables coupon variables in send text editor", () => {
    render(<SendTextStepEditor parentName="step" />)

    expect(tiptapEditorFieldMock).toHaveBeenCalledWith({
      includeCouponVariables: true,
      name: "step.text",
    })
  })

  test("enables coupon variables in WhatsApp flow text editor", () => {
    render(<WhatsappFlowStepEditor parentName="step" />)

    expect(tiptapEditorFieldMock).toHaveBeenCalledWith({
      includeCouponVariables: true,
      name: "step.text",
    })
  })
})
