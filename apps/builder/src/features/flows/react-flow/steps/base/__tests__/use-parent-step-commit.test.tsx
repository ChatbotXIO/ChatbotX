// @vitest-environment jsdom
import { zodResolver } from "@hookform/resolvers/zod"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { z } from "zod"
import { useParentStepCommit } from "../use-parent-step-commit"

const stepSchema = z.object({
  id: z.string(),
  stepType: z.literal("demo"),
  name: z.string().min(1),
  states: z.tuple([z.object({ id: z.string() })]),
})
type Step = z.infer<typeof stepSchema>

const invalidStep: Step = {
  id: "step-1",
  stepType: "demo",
  name: "",
  states: [{ id: "state-1" }],
}

let container: HTMLDivElement
let root: Root
let commit: ((patch: Partial<Step>) => void) | null = null
let formApi: UseFormReturn<{ step: Step }> | null = null

function StepConsumer() {
  commit = useParentStepCommit<Step>("step")
  return null
}

function Harness() {
  const form = useForm<{ step: Step }>({
    resolver: zodResolver(z.object({ step: stepSchema })),
    mode: "onChange",
    defaultValues: { step: invalidStep },
  })
  formApi = form
  const { isValid, isDirty } = form.formState

  return (
    <FormProvider {...form}>
      <div data-testid="valid">{String(isValid)}</div>
      <div data-testid="dirty">{String(isDirty)}</div>
      <StepConsumer />
    </FormProvider>
  )
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

const read = (testId: string) =>
  container.querySelector(`[data-testid="${testId}"]`)?.textContent

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  commit = null
  formApi = null
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

describe("useParentStepCommit", () => {
  const renderHarness = async () => {
    act(() => {
      root.render(<Harness />)
    })
    await flush()
  }

  test("re-runs the parent validation so a valid patch enables the form", async () => {
    await renderHarness()
    expect(read("valid")).toBe("false")

    await act(async () => {
      commit?.({ name: "Renamed" })
      await Promise.resolve()
    })
    await flush()

    expect(read("valid")).toBe("true")
  })

  test("merges the patch over the current value and preserves untouched fields", async () => {
    await renderHarness()

    await act(async () => {
      commit?.({ name: "Renamed" })
      await Promise.resolve()
    })
    await flush()

    expect(formApi?.getValues("step")).toEqual({
      id: "step-1",
      stepType: "demo",
      name: "Renamed",
      states: [{ id: "state-1" }],
    })
  })

  test("marks the parent field dirty", async () => {
    await renderHarness()
    expect(read("dirty")).toBe("false")

    await act(async () => {
      commit?.({ name: "Renamed" })
      await Promise.resolve()
    })
    await flush()

    expect(read("dirty")).toBe("true")
  })

  test("keeps the form invalid when the patch is still invalid", async () => {
    await renderHarness()

    await act(async () => {
      commit?.({ name: "" })
      await Promise.resolve()
    })
    await flush()

    expect(read("valid")).toBe("false")
  })
})
