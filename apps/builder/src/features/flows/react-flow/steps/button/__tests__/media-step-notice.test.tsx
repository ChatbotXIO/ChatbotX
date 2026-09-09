// @vitest-environment jsdom
import { buttonStepDefaultFn } from "@chatbotx.io/flow-config"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MediaStepNotice } from "../media-step-notice"

const STEP_TEXT = "This channel can't send this media type"
const BUTTONS_TEXT = "This channel can't send buttons with media"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    if (key === "flows.media.stepUnsupportedOnChannel") {
      return STEP_TEXT
    }
    return key === "flows.media.buttonsSkippedOnChannel" ? BUTTONS_TEXT : key
  },
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

const buttons = [buttonStepDefaultFn({ label: "Yes" })]

/** Mirrors the node-details form a media step editor lives inside. */
const Harness = ({
  channel,
  stepType,
  withButtons = true,
}: {
  channel: string
  stepType: string
  withButtons?: boolean
}) => {
  const form = useForm({
    defaultValues: {
      beforeStep: { channel },
      steps: [{ stepType, buttons: withButtons ? buttons : [] }],
    },
  })

  return (
    <FormProvider {...form}>
      <MediaStepNotice parentName="steps.0" />
    </FormProvider>
  )
}

const noticeText = () =>
  container.querySelector('[data-slot="media-step-notice"]')?.textContent

describe("MediaStepNotice", () => {
  test("warns that the whole step is skipped on a channel that cannot send it", () => {
    render(<Harness channel="whatsapp" stepType="sendVideo" />)

    expect(noticeText()).toBe(STEP_TEXT)
  })

  test("warns that only the buttons are skipped where the media itself is sent", () => {
    render(<Harness channel="instagram" stepType="sendImage" />)

    expect(noticeText()).toBe(BUTTONS_TEXT)
  })

  // Telegram carries a media step's buttons as an inline keyboard.
  test("stays silent on a channel that delivers the step in full", () => {
    render(<Harness channel="telegram" stepType="sendVideo" />)

    expect(noticeText()).toBeUndefined()
  })

  test("stays silent on omnichannel, the node default", () => {
    render(<Harness channel="omnichannel" stepType="sendVideo" />)

    expect(noticeText()).toBeUndefined()
  })

  test("stays silent while a buttons-dropping step has no buttons yet", () => {
    render(
      <Harness channel="instagram" stepType="sendImage" withButtons={false} />,
    )

    expect(noticeText()).toBeUndefined()
  })

  // A gif step has no buttons at all, so only the unsupported case applies.
  test("still warns for a gif step the channel cannot send", () => {
    render(<Harness channel="tiktok" stepType="sendGif" withButtons={false} />)

    expect(noticeText()).toBe(STEP_TEXT)
  })
})
