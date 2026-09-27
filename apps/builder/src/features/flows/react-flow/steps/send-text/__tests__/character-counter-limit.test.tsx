// @vitest-environment jsdom
import {
  buttonStepDefaultFn,
  resolveSendTextLengthLimits,
  TIKTOK_CARD_TITLE_MAX,
} from "@chatbotx.io/flow-config"
import { act, type ComponentProps, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import SendTextStepEditor from "../editor"

const tiptapEditorFieldMock = vi.fn()

vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: (props: { maxLength?: number; name: string }) => {
    tiptapEditorFieldMock(props)
    return <div data-testid={`tiptap-${props.name}`} />
  },
}))

vi.mock("../../button/editor", () => ({
  ButtonGroupEditor: () => <div data-testid="button-group-editor" />,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
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
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const render = (element: ReactElement) => {
  act(() => {
    root.render(element)
  })
}

let formApi: UseFormReturn | undefined

/** Mirrors the node-details form the send-text editor lives inside. */
const Harness = ({
  channel,
  buttons,
}: {
  channel: string
  buttons: ReturnType<typeof buttonStepDefaultFn>[]
}) => {
  const form = useForm({
    defaultValues: {
      beforeStep: { channel },
      steps: [{ buttons, text: "" }],
    },
  })
  formApi = form as unknown as UseFormReturn

  return (
    <FormProvider {...form}>
      <SendTextStepEditor parentName="steps.0" />
    </FormProvider>
  )
}

const lastMaxLength = () =>
  tiptapEditorFieldMock.mock.calls.at(-1)?.[0]?.maxLength

describe("send text character budget", () => {
  test("uses the channel's limit when it is stricter than the schema", () => {
    render(<Harness buttons={[]} channel="threads" />)

    expect(lastMaxLength()).toBe(500)
  })

  test("uses the omnichannel budget on an omnichannel node", () => {
    render(<Harness buttons={[]} channel="omnichannel" />)

    expect(lastMaxLength()).toBe(
      resolveSendTextLengthLimits({ channel: "omnichannel" }).text,
    )
  })

  test("uses the channel's wider limit where the platform allows more", () => {
    render(<Harness buttons={[]} channel="telegram" />)

    expect(lastMaxLength()).toBe(4096)
  })

  test("drops to TikTok's card title limit once a button is attached", () => {
    render(
      <Harness
        buttons={[buttonStepDefaultFn({ label: "Yes" })]}
        channel="tiktok"
      />,
    )

    expect(lastMaxLength()).toBe(TIKTOK_CARD_TITLE_MAX)
  })

  // The budget has to follow the step as it is edited, the same way the
  // TikTok truncation notice does.
  test("shrinks when a button is added to a TikTok node", () => {
    render(<Harness buttons={[]} channel="tiktok" />)
    expect(lastMaxLength()).toBe(
      resolveSendTextLengthLimits({ channel: "tiktok" }).text,
    )

    act(() => {
      formApi?.setValue("steps.0.buttons", [
        buttonStepDefaultFn({ label: "Yes" }),
      ])
    })

    expect(lastMaxLength()).toBe(TIKTOK_CARD_TITLE_MAX)
  })
})
