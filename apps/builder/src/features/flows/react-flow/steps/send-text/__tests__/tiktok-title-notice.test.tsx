// @vitest-environment jsdom
import { buttonStepDefaultFn } from "@chatbotx.io/flow-config"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { TiktokTitleNotice } from "../tiktok-title-notice"

const NOTICE_TEXT = "TikTok only sends the first 40 characters"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "flows.sendText.tiktokTitleTruncated" ? NOTICE_TEXT : key,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
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
  text,
  buttons,
}: {
  channel: string
  text: string
  buttons: ReturnType<typeof buttonStepDefaultFn>[]
}) => {
  const form = useForm({
    defaultValues: {
      beforeStep: { channel },
      steps: [{ text, buttons }],
    },
  })
  formApi = form as unknown as UseFormReturn

  return (
    <FormProvider {...form}>
      <TiktokTitleNotice parentName="steps.0" />
    </FormProvider>
  )
}

const noticeText = () =>
  container.querySelector('[data-slot="tiktok-title-notice"]')?.textContent

describe("TiktokTitleNotice", () => {
  test("warns on a TikTok node whose text is truncated once a button is attached", () => {
    render(
      <Harness
        buttons={[buttonStepDefaultFn({ label: "Yes" })]}
        channel="tiktok"
        text={"x".repeat(41)}
      />,
    )

    expect(noticeText()).toContain(NOTICE_TEXT)
  })

  test("stays silent when the text fits within the limit", () => {
    render(
      <Harness
        buttons={[buttonStepDefaultFn({ label: "Yes" })]}
        channel="tiktok"
        text={"x".repeat(40)}
      />,
    )

    expect(noticeText()).toBeUndefined()
  })

  test("stays silent when no buttons are attached", () => {
    render(<Harness buttons={[]} channel="tiktok" text={"x".repeat(41)} />)

    expect(noticeText()).toBeUndefined()
  })

  test("stays silent on a non-TikTok channel", () => {
    render(
      <Harness
        buttons={[buttonStepDefaultFn({ label: "Yes" })]}
        channel="messenger"
        text={"x".repeat(41)}
      />,
    )

    expect(noticeText()).toBeUndefined()
  })

  // The notice has to follow the step as it is edited; reading the form once
  // would leave it stale for the whole session.
  test("appears when the text grows past the limit after a button is added", () => {
    render(<Harness buttons={[]} channel="tiktok" text={"x".repeat(41)} />)
    expect(noticeText()).toBeUndefined()

    act(() => {
      formApi?.setValue("steps.0.buttons", [
        buttonStepDefaultFn({ label: "Yes" }),
      ])
    })

    expect(noticeText()).toContain(NOTICE_TEXT)
  })
})
