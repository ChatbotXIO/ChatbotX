// @vitest-environment jsdom
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MediaCaptionField } from "../media-caption-field"
import { MediaNoteSwitch } from "../media-note-switch"

vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: () => <div />,
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

/** Mirrors the node-details form a media step editor lives inside. */
const Harness = ({
  channel,
  stepType,
  asNote,
}: {
  channel: string
  stepType: string
  asNote?: boolean
}) => {
  const form = useForm({
    defaultValues: {
      beforeStep: { channel },
      steps: [{ stepType, buttons: [], asNote }],
    },
  })

  return (
    <FormProvider {...form}>
      <MediaNoteSwitch parentName="steps.0" />
      <MediaCaptionField parentName="steps.0" />
    </FormProvider>
  )
}

const noteSwitch = () =>
  container.querySelector('[data-slot="media-note-switch"]')
const captionField = () =>
  container.querySelector('[data-slot="media-caption-field"]')

describe("MediaNoteSwitch", () => {
  test("offers a voice message for audio on Telegram", () => {
    render(<Harness channel="telegram" stepType="sendAudio" />)

    expect(noteSwitch()?.textContent).toContain("flows.media.sendAsVoiceNote")
  })

  test("offers a round video for video on Telegram", () => {
    render(<Harness channel="telegram" stepType="sendVideo" />)

    expect(noteSwitch()?.textContent).toContain("flows.media.sendAsVideoNote")
  })

  test("is hidden on a channel without notes", () => {
    render(<Harness channel="messenger" stepType="sendAudio" />)

    expect(noteSwitch()).toBeNull()
  })

  test("stays visible when left on from another channel", () => {
    render(<Harness asNote channel="messenger" stepType="sendAudio" />)

    expect(noteSwitch()).not.toBeNull()
  })

  test("a round video hides the caption field", () => {
    render(<Harness asNote channel="telegram" stepType="sendVideo" />)

    expect(captionField()).toBeNull()
  })
})
