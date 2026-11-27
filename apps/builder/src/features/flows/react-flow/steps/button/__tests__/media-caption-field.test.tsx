// @vitest-environment jsdom
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MediaCaptionField } from "../media-caption-field"

type TiptapProps = { maxLength?: number; name: string }

const tiptapEditorFieldMock = vi.fn()

vi.mock("@/components/tiptap/tiptap-editor-field", () => ({
  TiptapEditorField: (props: TiptapProps) => {
    tiptapEditorFieldMock(props)
    return <div data-testid={`tiptap-${props.name}`} />
  },
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

/** Mirrors the node-details form a media step editor lives inside. */
const Harness = ({
  channel,
  caption,
}: {
  channel: string
  caption?: string
}) => {
  const form = useForm({
    defaultValues: {
      beforeStep: { channel },
      steps: [{ stepType: "sendImage", buttons: [], caption }],
    },
  })

  return (
    <FormProvider {...form}>
      <MediaCaptionField parentName="steps.0" />
    </FormProvider>
  )
}

const field = () => container.querySelector('[data-slot="media-caption-field"]')

describe("MediaCaptionField", () => {
  test("shows on a channel that sends captions, with its limit", () => {
    render(<Harness channel="telegram" />)

    expect(field()).not.toBeNull()
    expect(tiptapEditorFieldMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxLength: 1024, name: "steps.0.caption" }),
    )
  })

  test("is hidden on a channel without captions", () => {
    render(<Harness channel="messenger" />)

    expect(field()).toBeNull()
  })

  test("keeps a leftover caption visible so it can be removed", () => {
    render(<Harness caption="Hi" channel="messenger" />)

    expect(field()).not.toBeNull()
    expect(tiptapEditorFieldMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ maxLength: undefined }),
    )
  })
})
