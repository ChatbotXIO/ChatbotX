// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useForm,
  useFormContext,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  ButtonActionEditor,
  buttonActionOptions,
} from "@/features/facebook-marketing-messages/components/content/button-action-editor"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// The flow/node pickers read query-backed flow data, which this editor only
// consumes. Stub the sources so the test stays about the action shape.
vi.mock("@/features/flows/provider/flow-hook", () => ({
  useFlows: () => ({ data: [{ id: "10", flowVersions: [] }] }),
  useFlowSelectOptions: () => [{ value: "10", label: "Flow A" }],
  getFlowNodesOptions: () => [{ value: "20", label: "Node A" }],
}))

/**
 * The real `SelectField` renders its options into a portal that only mounts on
 * open, so the action switch cannot be driven from jsdom. This stub keeps what
 * matters here — writing the field then calling `triggerValueChange`, exactly
 * as `select-field.tsx` does — and exposes one button per option.
 */
vi.mock("@chatbotx.io/ui/components/form/select-field", () => ({
  SelectField: ({
    name,
    options,
    triggerValueChange,
  }: {
    name: string
    options: { value: string; label: string }[]
    triggerValueChange?: (value: string) => void
  }) => {
    const { setValue } = useFormContext()
    return (
      <div>
        {options.map((option) => (
          <button
            data-testid={`${name}:${option.value}`}
            key={option.value}
            onClick={() => {
              setValue(name, option.value)
              triggerValueChange?.(option.value)
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    )
  },
}))

const t = (key: string) => key

let form: UseFormReturn<FieldValues>

function Harness({
  actionType,
  allowWebUrl = true,
  button,
}: {
  actionType: string
  allowWebUrl?: boolean
  /** Overrides the seeded button, for the action-switch cases. */
  button?: Record<string, unknown>
}) {
  form = useForm({
    defaultValues: {
      button: button ?? {
        id: "1",
        title: "Go",
        actionType,
        url: "",
        browserSize: 100,
      },
    },
  }) as unknown as UseFormReturn<FieldValues>

  return (
    <FormProvider {...form}>
      <ButtonActionEditor allowWebUrl={allowWebUrl} parentName="button" />
    </FormProvider>
  )
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const renderHarness = (props: {
  actionType: string
  allowWebUrl?: boolean
  button?: Record<string, unknown>
}) => {
  // Keyed on actionType so a second render remounts the harness: without it
  // React reuses the same `useForm` instance and the new `defaultValues` are
  // ignored, leaving the previous action selected.
  act(() => root.render(<Harness key={props.actionType} {...props} />))
}

/**
 * The action list is asserted as data, not DOM: `SelectField` renders its
 * options into a portal that only mounts once the select is opened, so
 * querying for options on a closed select finds nothing regardless of which
 * actions are configured.
 */
describe("buttonActionOptions", () => {
  test("offers open website, external flow and external node", () => {
    const values = buttonActionOptions({ allowWebUrl: true, t }).map(
      (option) => option.value,
    )

    expect(values).toEqual([
      "openWebsite",
      "startExternalFlow",
      "startExternalNode",
    ])
  })

  test("never offers performAction or startAnotherNode — there is no canvas here", () => {
    const values = buttonActionOptions({ allowWebUrl: true, t }).map(
      (option) => option.value,
    )

    expect(values).not.toContain("performAction")
    expect(values).not.toContain("startAnotherNode")
  })

  test("hides open website when the caller disallows it (quick replies)", () => {
    const values = buttonActionOptions({ allowWebUrl: false, t }).map(
      (option) => option.value,
    )

    expect(values).not.toContain("openWebsite")
    expect(values).toEqual(["startExternalFlow", "startExternalNode"])
  })
})

describe("ButtonActionEditor", () => {
  test("shows the url field only for the open website action", () => {
    renderHarness({ actionType: "openWebsite" })
    expect(container.querySelector('[data-testid="mm-button-url"]')).not.toBe(
      null,
    )

    renderHarness({ actionType: "startExternalFlow" })
    expect(container.querySelector('[data-testid="mm-button-url"]')).toBe(null)
  })

  test("shows a node picker only for the external node action", () => {
    renderHarness({ actionType: "startExternalNode" })
    expect(container.querySelector('[data-testid="mm-button-node"]')).not.toBe(
      null,
    )

    renderHarness({ actionType: "startExternalFlow" })
    expect(container.querySelector('[data-testid="mm-button-node"]')).toBe(null)
  })
})

const switchActionTo = (actionType: string) => {
  const option = container.querySelector<HTMLButtonElement>(
    `[data-testid="button.actionType:${actionType}"]`,
  )
  act(() => option?.click())
}

/**
 * `browserSize` is required by the `openWebsite` branch but has no UI, so
 * without seeding, a button saved as a postback could never validate once
 * switched to `openWebsite` — leaving the editor dialog's Confirm permanently
 * disabled with no field to fix.
 */
describe("ButtonActionEditor — switching action", () => {
  test("seeds browserSize when a postback button switches to open website", () => {
    renderHarness({
      actionType: "startExternalFlow",
      button: {
        id: "1",
        title: "Go",
        actionType: "startExternalFlow",
        flowId: "10",
      },
    })
    expect(form.getValues("button.browserSize")).toBeUndefined()

    switchActionTo("openWebsite")

    expect(form.getValues("button.browserSize")).toBe(100)
    expect(form.getValues("button.url")).toBe("")
  })

  test("never overwrites a value the user already has", () => {
    renderHarness({
      actionType: "startExternalFlow",
      button: {
        id: "1",
        title: "Go",
        actionType: "startExternalFlow",
        flowId: "10",
        url: "https://kept.example",
        browserSize: 40,
      },
    })

    switchActionTo("openWebsite")

    expect(form.getValues("button.url")).toBe("https://kept.example")
    expect(form.getValues("button.browserSize")).toBe(40)
  })

  test("seeds the flow and node pickers for the external node action", () => {
    renderHarness({
      actionType: "openWebsite",
      button: {
        id: "1",
        title: "Go",
        actionType: "openWebsite",
        url: "",
        browserSize: 100,
      },
    })

    switchActionTo("startExternalNode")

    expect(form.getValues("button.flowId")).toBe("")
    expect(form.getValues("button.nodeId")).toBe("")
  })
})
