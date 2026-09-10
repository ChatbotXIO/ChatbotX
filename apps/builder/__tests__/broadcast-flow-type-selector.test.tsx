import { zodResolver } from "@hookform/resolvers/zod"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, type UseFormReturn, useForm } from "react-hook-form"
import { afterEach, describe, expect, test, vi } from "vitest"
import { BroadcastFlowTypeSelector } from "@/features/broadcasts/components/broadcast-flow-type-selector"
import {
  type CreateBroadcastRequest,
  createBroadcastRequest,
} from "@/features/broadcasts/schema/action"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const INBOX_ID = "11684346127351808"
const TEMPLATE_ID = "11687537534894080"
const FLOW_ID = "11688819248037888"

const baseForm: Partial<CreateBroadcastRequest> = {
  channel: "messenger",
  subaction: "messengerTemplateMessage",
  inboxIds: [INBOX_ID],
  schedulesType: "now",
  schedulesAt: null,
  contactFilter: { operator: "and", conditions: [] },
}

let container: HTMLDivElement | null = null
let root: Root | null = null
let formApi: UseFormReturn<CreateBroadcastRequest> | null = null

function Harness({
  defaultValues,
}: {
  defaultValues: Partial<CreateBroadcastRequest> & { templateType?: string }
}) {
  const form = useForm({
    mode: "onChange",
    resolver: zodResolver(createBroadcastRequest),
    defaultValues: defaultValues as CreateBroadcastRequest,
  })
  formApi = form as UseFormReturn<CreateBroadcastRequest>
  return (
    <FormProvider {...form}>
      <BroadcastFlowTypeSelector subaction="messengerTemplateMessage" />
      {/* Reading `isValid` in render subscribes to it, so the DOM reflects
          every revalidation the toggle triggers. */}
      <pre data-testid="valid">{String(form.formState.isValid)}</pre>
    </FormProvider>
  )
}

async function render(
  defaultValues: Partial<CreateBroadcastRequest> & { templateType?: string },
): Promise<HTMLDivElement> {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<Harness defaultValues={defaultValues} />)
  })
  // Prime the resolver so `isValid` reflects the (valid) starting state; under
  // `mode: "onChange"` RHF does not validate on mount.
  await act(async () => {
    await formApi?.trigger()
  })
  return container as HTMLDivElement
}

const validText = () =>
  container?.querySelector('[data-testid="valid"]')?.textContent

/** Flow = card 0, Template = card 1. */
const clickCard = async (index: number) => {
  await act(async () => {
    ;(
      container?.querySelectorAll('[role="button"]')[index] as HTMLElement
    ).click()
    // Let the async resolver settle so the subscribed `isValid` re-renders.
    await Promise.resolve()
  })
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
  formApi = null
})

describe("BroadcastFlowTypeSelector revalidates on switch", () => {
  test("switching Template → Flow drops the template and refreshes isValid to false", async () => {
    await render({
      ...baseForm,
      templateType: "template",
      targets: [{ inboxId: INBOX_ID, templateId: TEMPLATE_ID }],
    })
    expect(validText()).toBe("true")

    await clickCard(0) // Flow

    // The template is cleared, so the broadcast now sends neither flow nor
    // template — the submit gate must see this immediately, not the stale
    // pre-switch validity.
    expect(validText()).toBe("false")
    expect(formApi?.getValues("targets")).toEqual([{ inboxId: INBOX_ID }])
  })

  test("switching Flow → Template drops the flow and refreshes isValid to false", async () => {
    await render({
      ...baseForm,
      templateType: "flow",
      targets: [{ inboxId: INBOX_ID, flowId: FLOW_ID }],
    })
    expect(validText()).toBe("true")

    await clickCard(1) // Template

    expect(validText()).toBe("false")
    expect(formApi?.getValues("targets")).toEqual([{ inboxId: INBOX_ID }])
  })
})
