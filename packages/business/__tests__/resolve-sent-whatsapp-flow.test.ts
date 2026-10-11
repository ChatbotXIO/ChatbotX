import {
  decodeTemplateFlowToken,
  encodeTemplateFlowToken,
  TemplateFlowOrigin,
  type TemplateFlowToken,
} from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findBroadcastByIdForResponse = vi.fn()
const findFlowVersion = vi.fn()
const findActiveFlow = vi.fn()
const findWhatsappFlowSourceId = vi.fn()
const loggerWarn = vi.fn()

vi.mock("../src/broadcast/service", () => ({
  broadcastService: {
    findByIdForResponse: (...args: unknown[]) =>
      findBroadcastByIdForResponse(...args),
  },
}))
vi.mock("../src/flow-version/service", () => ({
  flowVersionService: {
    findByIdForWorkspace: (...args: unknown[]) => findFlowVersion(...args),
  },
}))
vi.mock("../src/flow/service", () => ({
  flowService: {
    findActiveById: (...args: unknown[]) => findActiveFlow(...args),
  },
}))
vi.mock("../src/whatsapp-flow/service", () => ({
  whatsappFlowService: {
    findSourceId: (...args: unknown[]) => findWhatsappFlowSourceId(...args),
  },
}))
vi.mock("../src/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarn(...args) },
}))

const { resolveTemplateFlowButton, resolveSentWhatsappFlow } = await import(
  "../src/whatsapp-flow-response/resolve-sent-flow"
)

const context = { workspaceId: "ws-1", inboxId: "inbox-1" }

const FLOW_ID = "11612473309626368"
const FLOW_VERSION_ID = "11612473309626369"
const STEP_ID = "11612473309626370"
const BUTTON_ID = "11612473309626371"

const makeFlowParam = (flowSourceId = "wa-flow-1") => ({
  sub_type: "flow" as const,
  index: 0,
  flowSourceId,
  fieldMappings: [{ paramKey: "email", customFieldId: "cf-email" }],
})

const versionWithSteps = (steps: unknown[]) => ({
  nodes: [{ data: { details: { steps } } }],
})

const broadcastToken = (cardIndex?: number) =>
  encodeTemplateFlowToken({
    origin: TemplateFlowOrigin.Broadcast,
    broadcastId: FLOW_ID,
    buttonIndex: 0,
    ...(cardIndex === undefined ? {} : { cardIndex }),
  })

const decoded = (token: string) =>
  decodeTemplateFlowToken(token) as TemplateFlowToken

const whatsappFlowStep = (flow: { id: string | null; sourceId: string }) => ({
  id: "step-1",
  stepType: "whatsappFlow",
  text: "body",
  buttons: [{ id: BUTTON_ID, label: "Go", steps: [] }],
  inboxId: null,
  flow: { ...flow, startScreenId: "WELCOME", fieldMappings: [] },
})

beforeEach(() => {
  vi.clearAllMocks()
  findBroadcastByIdForResponse.mockResolvedValue(null)
  findFlowVersion.mockResolvedValue(undefined)
  findActiveFlow.mockResolvedValue(undefined)
  findWhatsappFlowSourceId.mockResolvedValue(undefined)
})

describe("resolveTemplateFlowButton", () => {
  test("resolves a broadcast's top-level FLOW button for the responding inbox", async () => {
    const param = makeFlowParam()
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: "wa-integration-1",
      templateData: { button: [param] },
    })

    const resolved = await resolveTemplateFlowButton(
      decoded(broadcastToken()),
      context,
    )

    expect(findBroadcastByIdForResponse).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: FLOW_ID,
      inboxId: "inbox-1",
    })
    expect(resolved).toEqual({
      integrationWhatsappId: "wa-integration-1",
      flowSourceId: "wa-flow-1",
      param,
    })
  })

  test("keeps a multi-page broadcast's null integration", async () => {
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: null,
      templateData: { button: [makeFlowParam("wa-flow-page-b")] },
    })

    const resolved = await resolveTemplateFlowButton(
      decoded(broadcastToken()),
      context,
    )

    expect(resolved).toMatchObject({
      integrationWhatsappId: null,
      flowSourceId: "wa-flow-page-b",
    })
  })

  test("resolves a carousel card's FLOW button", async () => {
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: "wa-integration-1",
      templateData: {
        carousel: [
          { card_index: 0, button: [makeFlowParam("wrong-flow")] },
          { card_index: 2, button: [makeFlowParam("wa-flow-carousel")] },
        ],
      },
    })

    const resolved = await resolveTemplateFlowButton(
      decoded(broadcastToken(2)),
      context,
    )

    expect(resolved?.flowSourceId).toBe("wa-flow-carousel")
  })

  test("resolves a flow step's template FLOW button from the pinned version", async () => {
    const param = makeFlowParam("wa-flow-step")
    findFlowVersion.mockResolvedValue(
      versionWithSteps([
        {
          id: STEP_ID,
          stepType: "sendWaTemplateMessage",
          template: { params: { button: [param] } },
        },
      ]),
    )

    const resolved = await resolveTemplateFlowButton(
      decoded(
        encodeTemplateFlowToken({
          origin: TemplateFlowOrigin.FlowStep,
          flowId: FLOW_ID,
          flowVersionId: FLOW_VERSION_ID,
          stepId: STEP_ID,
          buttonIndex: 0,
        }),
      ),
      context,
    )

    expect(findFlowVersion).toHaveBeenCalledWith({
      versionId: FLOW_VERSION_ID,
      workspaceId: "ws-1",
    })
    expect(resolved).toEqual({ flowSourceId: "wa-flow-step", param })
  })

  test("returns null when the broadcast is missing", async () => {
    expect(
      await resolveTemplateFlowButton(decoded(broadcastToken()), context),
    ).toBeNull()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ broadcastId: FLOW_ID }),
      "[template-flow-response] broadcast not found",
    )
  })

  test("returns null when the button is not a FLOW button", async () => {
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: "wa-integration-1",
      templateData: {
        button: [{ sub_type: "quick_reply", index: 0, payload: "payload" }],
      },
    })

    expect(
      await resolveTemplateFlowButton(decoded(broadcastToken()), context),
    ).toBeNull()
  })

  test("returns null when the flow version is missing", async () => {
    const resolved = await resolveTemplateFlowButton(
      decoded(
        encodeTemplateFlowToken({
          origin: TemplateFlowOrigin.FlowStep,
          flowId: FLOW_ID,
          flowVersionId: FLOW_VERSION_ID,
          stepId: STEP_ID,
          buttonIndex: 0,
        }),
      ),
      context,
    )

    expect(resolved).toBeNull()
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: FLOW_ID }),
      "[template-flow-response] flow version not found",
    )
  })
})

describe("resolveSentWhatsappFlow", () => {
  const stepToken = `${FLOW_ID}:${FLOW_VERSION_ID}:${BUTTON_ID}`

  test("resolves a template token through its FLOW button", async () => {
    findBroadcastByIdForResponse.mockResolvedValue({
      integrationWhatsappId: "wa-integration-1",
      templateData: { button: [makeFlowParam("wa-flow-1")] },
    })

    expect(
      await resolveSentWhatsappFlow({
        ...context,
        flowToken: broadcastToken(),
      }),
    ).toEqual({
      flowSourceId: "wa-flow-1",
      integrationWhatsappId: "wa-integration-1",
    })
  })

  test("resolves a Send WhatsApp Flow step by its button, preferring flow.id", async () => {
    findFlowVersion.mockResolvedValue(
      versionWithSteps([
        whatsappFlowStep({ id: "22", sourceId: "stale-source" }),
      ]),
    )
    findWhatsappFlowSourceId.mockResolvedValue("current-source")

    expect(
      await resolveSentWhatsappFlow({ ...context, flowToken: stepToken }),
    ).toEqual({ flowSourceId: "current-source" })
    expect(findWhatsappFlowSourceId).toHaveBeenCalledWith({
      id: "22",
      workspaceId: "ws-1",
    })
  })

  test("falls back to the step's stored sourceId when the Flow row is gone", async () => {
    findFlowVersion.mockResolvedValue(
      versionWithSteps([
        whatsappFlowStep({ id: "22", sourceId: "stored-source" }),
      ]),
    )

    expect(
      await resolveSentWhatsappFlow({ ...context, flowToken: stepToken }),
    ).toEqual({ flowSourceId: "stored-source" })
  })

  test("uses the flow's current version when the token pins none", async () => {
    findActiveFlow.mockResolvedValue({ currentVersionId: FLOW_VERSION_ID })
    findFlowVersion.mockResolvedValue(
      versionWithSteps([whatsappFlowStep({ id: null, sourceId: "src-1" })]),
    )

    expect(
      await resolveSentWhatsappFlow({
        ...context,
        flowToken: `${FLOW_ID}::${BUTTON_ID}`,
      }),
    ).toEqual({ flowSourceId: "src-1" })
    expect(findActiveFlow).toHaveBeenCalledWith({
      id: FLOW_ID,
      workspaceId: "ws-1",
    })
  })

  test.each([
    ["no token", null],
    ["an empty token", ""],
    ["a token this workspace did not issue", "a-random-uuid-from-elsewhere"],
  ])("returns null for %s", async (_label, flowToken) => {
    expect(await resolveSentWhatsappFlow({ ...context, flowToken })).toBeNull()
  })

  test("returns null when no step carries the button", async () => {
    findFlowVersion.mockResolvedValue(versionWithSteps([]))

    expect(
      await resolveSentWhatsappFlow({ ...context, flowToken: stepToken }),
    ).toBeNull()
  })
})
