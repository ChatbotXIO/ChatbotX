// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FormProvider, useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { InboundWebhookFormValues } from "../src/features/inbound-webhooks/lib/webhook-form"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${values.identities}` : key,
}))
vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useInboxList: () => [
    { id: "10", channel: "messenger", status: "connected" },
    { id: "20", channel: "whatsapp", status: "connected" },
    { id: "30", channel: "webchat", status: "connected" },
    { id: "40", channel: "omnichannel", status: "connected" },
  ],
}))
vi.mock("../src/features/inbound-webhooks/components/json-path-field", () => ({
  JsonPathField: () => null,
}))

const { ContactLookupSection } = await import(
  "../src/features/inbound-webhooks/components/contact-lookup-section"
)

const base: InboundWebhookFormValues = {
  inboxMode: "inbox",
  inboxId: "",
  payloadChannel: "",
  identifierKind: "",
  inboxJsonPath: "",
  channelUserIdPath: "",
  phonePath: "",
  emailPath: "",
  fullNamePath: "",
  fieldMappings: [],
  actions: [],
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
  act(() => root.unmount())
  container.remove()
})

const Harness = ({ values }: { values: Partial<InboundWebhookFormValues> }) => {
  const form = useForm<InboundWebhookFormValues>({
    defaultValues: { ...base, ...values },
  })
  return (
    <FormProvider {...form}>
      <ContactLookupSection sample={undefined} />
    </FormProvider>
  )
}

let renders = 0
const warning = (values: Partial<InboundWebhookFormValues>) => {
  // A fresh key per call: each call is a new form, not an update of the last one.
  renders += 1
  act(() => root.render(<Harness key={renders} values={values} />))
  return container.querySelector('[role="status"]')?.textContent ?? null
}

describe("ContactLookupSection creation warning", () => {
  test("says nothing while no identity path is filled (the save rule covers that)", () => {
    expect(warning({ inboxId: "10" })).toBeNull()
  })

  test("says nothing while the channel is not known yet", () => {
    expect(warning({ inboxId: "999", emailPath: "$.email" })).toBeNull()
  })

  test("Messenger without a PSID path names the PSID", () => {
    expect(warning({ inboxId: "10", emailPath: "$.email" })).toBe(
      "identity.creationHint:channelUserIdKinds.psid",
    )
  })

  test("Messenger with a PSID path is quiet", () => {
    expect(
      warning({ inboxId: "10", channelUserIdPath: "$.sender.id" }),
    ).toBeNull()
  })

  test("WhatsApp wants a phone; a PSID path does not count", () => {
    expect(warning({ inboxId: "20", channelUserIdPath: "$.id" })).toBe(
      "identity.creationHint:identity.phone",
    )
    expect(warning({ inboxId: "20", phonePath: "$.phone" })).toBeNull()
  })

  test("webchat accepts a phone or an email, and names both otherwise", () => {
    expect(warning({ inboxId: "30", fullNamePath: "$.name" })).toBe(
      "identity.creationHint:identity.phone / identity.email",
    )
    expect(warning({ inboxId: "30", emailPath: "$.email" })).toBeNull()
  })

  test("a channel that creates no contacts never warns", () => {
    expect(warning({ inboxId: "40", fullNamePath: "$.name" })).toBeNull()
  })

  test("payload mode uses the picked channel, and is announced politely (role=status)", () => {
    expect(
      warning({
        inboxMode: "payload",
        payloadChannel: "whatsapp",
        emailPath: "$.email",
      }),
    ).toBe("identity.creationHint:identity.phone")
  })
})
