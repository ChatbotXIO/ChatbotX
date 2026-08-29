// @vitest-environment jsdom
import { act, type ReactNode, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm, useFormContext } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { FieldValuePickerPopover } from "@/features/custom-fields/components/field-value-picker-popover"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      "fields.boolean.true": "True",
      "fields.boolean.false": "False",
    })[key] ?? key,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button onClick={onClick} type="button">
      {children}
    </button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (day: Date) => void }) => (
    <button
      data-testid="calendar-pick"
      onClick={() => onSelect(new Date(2026, 4, 19, 10, 30, 45))}
      type="button"
    >
      pick date
    </button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/date-picker", () => ({
  TimePicker: ({ onChange }: { onChange: (date: Date) => void }) => (
    <button
      data-testid="time-pick"
      onClick={() => onChange(new Date(2026, 4, 19, 14, 5, 9))}
      type="button"
    >
      pick time
    </button>
  ),
}))

// Stands in for the real Base UI popover primitives (portal + positioning
// logic that would otherwise make this test depend on real DOM measurement
// and animation timing). Mirrors just the contract `FieldValuePickerPopover`
// relies on: a controlled `open`/`onOpenChange` pair, and a trigger whose
// click always *requests* an open — leaving `FieldValuePickerPopover`'s own
// `onOpenChange` gate (the `isClickInInputRef` check) as the thing actually
// under test.
type PopoverContextValue = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

vi.mock("@chatbotx.io/ui/components/ui/popover", async () => {
  const React = await import("react")
  const PopoverContext = React.createContext<PopoverContextValue>({
    open: false,
    onOpenChange: () => {
      // no-op default
    },
  })

  function Popover({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode
    open: boolean
    onOpenChange: (open: boolean) => void
  }) {
    return (
      <PopoverContext.Provider value={{ open, onOpenChange }}>
        {children}
      </PopoverContext.Provider>
    )
  }

  function PopoverTrigger({
    render,
  }: {
    render: React.ReactElement<{ onClick?: (event: unknown) => void }>
  }) {
    const { onOpenChange } = React.useContext(PopoverContext)
    return React.cloneElement(render, {
      onClick: (event: unknown) => {
        render.props.onClick?.(event)
        onOpenChange(true)
      },
    })
  }

  function PopoverContent({ children }: { children: React.ReactNode }) {
    const { open } = React.useContext(PopoverContext)
    return open ? <div data-testid="popover-content">{children}</div> : null
  }

  return { Popover, PopoverTrigger, PopoverContent }
})

// Tracks the identity of the wrapped input across renders: `useRef`'s
// initializer only runs once per mount, so `mountedWithKey.current` reflects
// the `inputKey` this particular instance was born with. A pick that bumps
// `inputKey` without remounting would leave this value stale.
function TrackedInput({ inputKey }: { inputKey: number }) {
  const mountedWithKey = useRef(inputKey)
  return (
    <input
      data-mounted-key={mountedWithKey.current}
      data-testid="wrapped-input"
      readOnly
      value=""
    />
  )
}

function VariableIconInput() {
  return (
    <div>
      <input data-testid="text-input" readOnly value="" />
      <button data-testid="variable-icon" type="button">
        {"{{}}"}
      </button>
    </div>
  )
}

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
  vi.restoreAllMocks()
})

function FormHarness({
  defaultValue,
  onValuesChange,
  children,
}: {
  defaultValue?: string
  onValuesChange?: (value: string) => void
  children: ReactNode
}) {
  const form = useForm({ defaultValues: { value: defaultValue ?? "" } })

  return (
    <FormProvider {...form}>
      <FormWatcher onValuesChange={onValuesChange} />
      {children}
    </FormProvider>
  )
}

function FormWatcher({
  onValuesChange,
}: {
  onValuesChange?: (value: string) => void
}) {
  const form = useFormContext()
  const value = form.watch("value")
  onValuesChange?.(value)
  return null
}

const click = (element: Element | null | undefined) => {
  act(() => {
    element?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    )
  })
}

describe("FieldValuePickerPopover", () => {
  test("boolean picker writes canonical true/false via form.setValue", () => {
    let latestValue: string | undefined
    act(() => {
      root.render(
        <FormHarness onValuesChange={(value) => (latestValue = value)}>
          <FieldValuePickerPopover kind="boolean" name="value">
            {(inputKey) => <TrackedInput inputKey={inputKey} key={inputKey} />}
          </FieldValuePickerPopover>
        </FormHarness>,
      )
    })

    click(container.querySelector('[data-testid="wrapped-input"]'))
    // Boolean picker renders "True"/"False" buttons once open.
    click(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "False",
      ),
    )
    expect(latestValue).toBe("false")

    click(container.querySelector('[data-testid="wrapped-input"]'))
    click(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "True",
      ),
    )
    expect(latestValue).toBe("true")
  })

  test("datetime with withSeconds=false writes yyyy-MM-dd HH:mm", () => {
    let latestValue: string | undefined
    act(() => {
      root.render(
        <FormHarness onValuesChange={(value) => (latestValue = value)}>
          <FieldValuePickerPopover
            kind="datetime"
            name="value"
            withSeconds={false}
          >
            {(inputKey) => <TrackedInput inputKey={inputKey} key={inputKey} />}
          </FieldValuePickerPopover>
        </FormHarness>,
      )
    })

    click(container.querySelector('[data-testid="wrapped-input"]'))
    click(container.querySelector('[data-testid="time-pick"]'))

    expect(latestValue).toBe("2026-05-19 14:05")
  })

  test("datetime defaults to withSeconds and writes yyyy-MM-dd HH:mm:ss", () => {
    let latestValue: string | undefined
    act(() => {
      root.render(
        <FormHarness onValuesChange={(value) => (latestValue = value)}>
          <FieldValuePickerPopover kind="datetime" name="value">
            {(inputKey) => <TrackedInput inputKey={inputKey} key={inputKey} />}
          </FieldValuePickerPopover>
        </FormHarness>,
      )
    })

    click(container.querySelector('[data-testid="wrapped-input"]'))
    click(container.querySelector('[data-testid="time-pick"]'))

    expect(latestValue).toBe("2026-05-19 14:05:09")
  })

  test("date picker writes yyyy-MM-dd", () => {
    let latestValue: string | undefined
    act(() => {
      root.render(
        <FormHarness onValuesChange={(value) => (latestValue = value)}>
          <FieldValuePickerPopover kind="date" name="value">
            {(inputKey) => <TrackedInput inputKey={inputKey} key={inputKey} />}
          </FieldValuePickerPopover>
        </FormHarness>,
      )
    })

    click(container.querySelector('[data-testid="wrapped-input"]'))
    click(container.querySelector('[data-testid="calendar-pick"]'))

    expect(latestValue).toBe("2026-05-19")
  })

  test("the wrapped child remounts (new key) after a pick", () => {
    act(() => {
      root.render(
        <FormHarness>
          <FieldValuePickerPopover kind="date" name="value">
            {(inputKey) => <TrackedInput inputKey={inputKey} key={inputKey} />}
          </FieldValuePickerPopover>
        </FormHarness>,
      )
    })

    const before = container
      .querySelector('[data-testid="wrapped-input"]')
      ?.getAttribute("data-mounted-key")
    expect(before).toBe("0")

    click(container.querySelector('[data-testid="wrapped-input"]'))
    click(container.querySelector('[data-testid="calendar-pick"]'))

    const after = container
      .querySelector('[data-testid="wrapped-input"]')
      ?.getAttribute("data-mounted-key")
    expect(after).toBe("1")
    expect(after).not.toBe(before)
  })

  test("clicking the variable icon does not open the picker", () => {
    act(() => {
      root.render(
        <FormHarness>
          <FieldValuePickerPopover kind="boolean" name="value">
            {() => <VariableIconInput />}
          </FieldValuePickerPopover>
        </FormHarness>,
      )
    })

    click(container.querySelector('[data-testid="variable-icon"]'))

    expect(
      container.querySelector('[data-testid="popover-content"]'),
    ).toBeNull()
  })

  test("clicking the text input does open the picker", () => {
    act(() => {
      root.render(
        <FormHarness>
          <FieldValuePickerPopover kind="boolean" name="value">
            {() => <VariableIconInput />}
          </FieldValuePickerPopover>
        </FormHarness>,
      )
    })

    click(container.querySelector('[data-testid="text-input"]'))

    expect(
      container.querySelector('[data-testid="popover-content"]'),
    ).not.toBeNull()
  })
})
