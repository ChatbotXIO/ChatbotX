// @vitest-environment jsdom
import {
  type AppointmentSchedulingStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { act, type ButtonHTMLAttributes, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
} from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AppointmentSchedulingStepEditor } from "../editor"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock(
  "@/features/appointment-calendars/provider/appointment-calendar-hook",
  () => ({
    useAppointmentCalendarSelectOptions: () => [
      { label: "Cal 1", value: "456" },
    ],
  }),
)

vi.mock("@/features/custom-fields/provider/custom-field-hook", () => ({
  useCustomFieldSelectOptions: () => [{ label: "Output field", value: "789" }],
}))

vi.mock("@/features/custom-fields/custom-field-select", () => ({
  CustomFieldSelect: ({ name }: { name: string }) => {
    const form = useFormContext()
    return (
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <input
            data-testid={`custom-field-${name}`}
            onChange={(event) => field.onChange(event.target.value)}
            value={field.value ?? ""}
          />
        )}
      />
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogDescription: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTrigger: ({ render }: { render: ReactNode }) => <>{render}</>,
}))

vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock("@chatbotx.io/ui/components/ui/form", async () => {
  const { FormProvider: Provider, Controller: ControllerImpl } = await import(
    "react-hook-form"
  )
  return { Form: Provider, FormField: ControllerImpl }
})

// Base UI's real Select needs pointer capture/portal support jsdom doesn't
// provide; swap it for a plain native <select> wired the same way (items via
// onValueChange) so the mode field stays a real, driveable RHF Controller.
vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode
    value?: string
    onValueChange: (v: string) => void
  }) => (
    <select
      data-testid="mode-select"
      onChange={(e) => onValueChange(e.target.value)}
      value={value ?? ""}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

vi.mock("@chatbotx.io/ui/components/form/combobox-field", () => ({
  ComboboxField: ({ name }: { name: string }) => {
    const form = useFormContext()
    return (
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <input
            data-testid={`combobox-${name}`}
            onChange={(e) => field.onChange(e.target.value)}
            value={field.value ?? ""}
          />
        )}
      />
    )
  },
}))

vi.mock("@chatbotx.io/ui/components/form/switch-field", () => ({
  SwitchField: () => null,
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

function Harness({ step }: { step: AppointmentSchedulingStepSchema }) {
  const form = useForm<{ step: AppointmentSchedulingStepSchema }>({
    defaultValues: { step },
  })

  return (
    <FormProvider {...form}>
      <AppointmentSchedulingStepEditor parentName="step" />
    </FormProvider>
  )
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

const openDialogAndGetSubmitButton = async () => {
  const editButton = container.querySelector("button") as HTMLButtonElement
  await act(() => {
    editButton.click()
  })
  await flush()

  const buttons = Array.from(container.querySelectorAll("form button"))
  return buttons.find(
    (b) => b.getAttribute("type") === "submit",
  ) as HTMLButtonElement
}

describe("AppointmentSchedulingStepEditor", () => {
  test("Continue is enabled for an already-saved book step (regression: shouldUnregister dropped id/stepType/states)", async () => {
    const savedStep: AppointmentSchedulingStepSchema = {
      id: "1",
      stepType: stepTypes.enum.appointmentScheduling,
      calendarId: "456",
      states: [
        { id: "11", stateType: "success" },
        { id: "12", stateType: "error" },
      ],
      mode: "book",
    }

    act(() => {
      root.render(<Harness step={savedStep} />)
    })
    await flush()

    const submitButton = await openDialogAndGetSubmitButton()
    expect(submitButton.disabled).toBe(false)
  })

  test("Continue is enabled for an already-saved checkAvailability step", async () => {
    const savedStep: AppointmentSchedulingStepSchema = {
      id: "2",
      stepType: stepTypes.enum.appointmentScheduling,
      calendarId: "456",
      states: [
        { id: "21", stateType: "success" },
        { id: "22", stateType: "error" },
      ],
      mode: "checkAvailability",
      resultUsedByAI: false,
      outputCustomFieldId: "789",
    }

    act(() => {
      root.render(<Harness step={savedStep} />)
    })
    await flush()

    const submitButton = await openDialogAndGetSubmitButton()
    expect(submitButton.disabled).toBe(false)
  })
})
