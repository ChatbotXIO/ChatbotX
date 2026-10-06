// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The credential-strategy workspace integrations (SendGrid, Moosend, Drip,
// Mailchimp, MailerLite, ActiveCampaign, GetResponse) built from
// `createCredentialConnectAction` — thin wrappers that validate the connect
// payload via their own schema, then delegate straight to the Connection
// domain's `connectionService.connectFromCredentials` with
// `allowUpdate: true` (these integrations are workspace singletons, so a
// repeat connect always replaces the previously stored credentials). Unlike
// the AI-key providers, there is no live verification step and no
// post-connect side effect (no cache invalidation). Klaviyo also uses this
// factory but already has its own dedicated test at
// `apps/builder/src/features/integration-klaviyo/actions/__tests__/connect.action.test.ts`.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  connectFromCredentials: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain, authActionClient: chain }
})

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: { connectFromCredentials: mocks.connectFromCredentials },
}))

// (no further vi.mock registrations needed: createCredentialConnectAction
// has no AI-key-style verification step or post-connect side effect.)

// Dynamic imports are required here (not a static-import violation): the
// action modules must load *after* the vi.mock registrations above are in
// place, so each action's `connectionService` import resolves to the test
// double instead of the real implementation.
const { connectSendGridAction } = await import(
  "@/features/integration-sendgrid/actions/connect.action"
)
const { connectMoosendAction } = await import(
  "@/features/integration-moosend/actions/connect.action"
)
const { connectDripAction } = await import(
  "@/features/integration-drip/actions/connect.action"
)
const { connectMailchimpAction } = await import(
  "@/features/integration-mailchimp/actions/connect.action"
)
const { connectMailerLiteAction } = await import(
  "@/features/integration-mailer-lite/actions/connect.action"
)
const { connectActiveCampaignAction } = await import(
  "@/features/integration-active-campaign/actions/connect.action"
)
const { connectGetResponseAction } = await import(
  "@/features/integration-get-response/actions/connect.action"
)

type ActionHandler<TParsedInput, TBindArgs extends unknown[]> = (props: {
  parsedInput: TParsedInput
  bindArgsParsedInputs: TBindArgs
}) => Promise<unknown>

const workspaceId = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each([
  {
    action: () => connectSendGridAction,
    expectedProviderArg: "sendGrid",
    label: "SendGrid",
    payload: { apiKey: "sg-api-key" },
  },
  {
    action: () => connectMoosendAction,
    expectedProviderArg: "moosend",
    label: "Moosend",
    payload: { apiKey: "moosend-api-key" },
  },
  {
    action: () => connectDripAction,
    expectedProviderArg: "drip",
    label: "Drip",
    payload: { apiToken: "drip-api-token" },
  },
  {
    action: () => connectMailchimpAction,
    expectedProviderArg: "mailchimp",
    label: "Mailchimp",
    payload: { apiKey: "mailchimp-api-key" },
  },
  {
    action: () => connectMailerLiteAction,
    expectedProviderArg: "mailerLite",
    label: "MailerLite",
    payload: { apiKey: "mailerlite-api-key" },
  },
  {
    action: () => connectActiveCampaignAction,
    expectedProviderArg: "activeCampaign",
    label: "ActiveCampaign",
    payload: {
      apiUrl: "https://example.api-us1.com",
      apiKey: "active-campaign-api-key",
    },
  },
  {
    action: () => connectGetResponseAction,
    expectedProviderArg: "getResponse",
    label: "GetResponse",
    payload: { apiKey: "get-response-api-key" },
  },
])("$label connect action", ({ action, expectedProviderArg, payload }) => {
  test("connects via connectFromCredentials with allowUpdate: true using the parsed input as config", async () => {
    mocks.connectFromCredentials.mockResolvedValue(undefined)

    await (action() as unknown as ActionHandler<typeof payload, [string]>)({
      parsedInput: payload,
      bindArgsParsedInputs: [workspaceId],
    })

    expect(mocks.connectFromCredentials).toHaveBeenCalledWith({
      workspaceId,
      provider: expectedProviderArg,
      config: payload,
      allowUpdate: true,
    })
  })

  test("propagates the error when connectFromCredentials fails", async () => {
    const failure = new Error("boom")
    mocks.connectFromCredentials.mockRejectedValue(failure)

    await expect(
      (action() as unknown as ActionHandler<typeof payload, [string]>)({
        parsedInput: payload,
        bindArgsParsedInputs: [workspaceId],
      }),
    ).rejects.toThrow(failure)
  })
})
