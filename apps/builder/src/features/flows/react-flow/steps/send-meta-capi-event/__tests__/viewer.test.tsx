// @vitest-environment jsdom
import {
  type SendMetaCapiEventSchema,
  sendMetaCapiEventDefaultFn,
} from "@chatbotx.io/flow-config"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import SendMetaCapiEventViewer from "../viewer"

/** Echoes the key back so assertions never depend on translated copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/components/base-handle", () => ({
  BaseHandle: ({ id }: { id?: string | null }) => (
    <span data-handleid={id ?? ""} />
  ),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
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

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui)
  })
}

describe("SendMetaCapiEventViewer", () => {
  test("a legacy step with no actionSource renders without throwing and hides the action-source line", () => {
    // Flow versions saved before `actionSource` existed carry no value for
    // it at all, and the editor restores node data raw (no zod defaults) —
    // this simulates that shape, the way a legacy step would actually arrive
    // at runtime despite `SendMetaCapiEventSchema` requiring the field.
    const { actionSource: _actionSource, ...legacyFields } =
      sendMetaCapiEventDefaultFn()
    const legacyData = legacyFields as SendMetaCapiEventSchema

    expect(() =>
      render(<SendMetaCapiEventViewer data={legacyData} />),
    ).not.toThrow()
    expect(container.textContent).not.toContain("metaConversions.actionSource")
  })

  test("a non-business_messaging step still shows its action-source label", () => {
    render(
      <SendMetaCapiEventViewer
        data={{ ...sendMetaCapiEventDefaultFn(), actionSource: "email" }}
      />,
    )

    expect(container.textContent).toContain(
      "metaConversions.actionSource.email",
    )
  })

  test("business_messaging hides the action-source line", () => {
    render(
      <SendMetaCapiEventViewer
        data={{
          ...sendMetaCapiEventDefaultFn(),
          actionSource: "business_messaging",
        }}
      />,
    )

    expect(container.textContent).not.toContain("metaConversions.actionSource")
  })
})
