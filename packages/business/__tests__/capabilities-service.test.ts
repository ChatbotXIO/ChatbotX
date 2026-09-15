// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { aiAgentService } = await import("../src/ai-agent/service")
const { botFieldService } = await import("../src/bot-field/service")
const { customFieldService } = await import("../src/custom-field/service")
const { flowService } = await import("../src/flow/service")
const { inboxService } = await import("../src/inbox/service")
const { sequenceService } = await import("../src/sequence/service")
const { tagService } = await import("../src/tag/service")
const { whatsappMessageTemplateService } = await import(
  "../src/whatsapp-message-template/service"
)
const {
  getCapabilities,
  getFlowAuthoringContext,
  CAPABILITIES_INCLUDES,
  DEFAULT_INCLUDES,
  OPT_IN_INCLUDES,
} = await import("../src/capabilities/service")
const { capabilitiesResponseSchema } = await import(
  "../src/capabilities/schema"
)

const emptyListResult = { data: [], pageCount: 0 }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(inboxService, "list").mockResolvedValue(emptyListResult as never)
  vi.spyOn(whatsappMessageTemplateService, "list").mockResolvedValue(
    [] as never,
  )
  vi.spyOn(customFieldService, "list").mockResolvedValue(
    emptyListResult as never,
  )
  vi.spyOn(botFieldService, "list").mockResolvedValue(emptyListResult as never)
  vi.spyOn(tagService, "listActive").mockResolvedValue([] as never)
  vi.spyOn(aiAgentService, "listAIAgents").mockResolvedValue(
    emptyListResult as never,
  )
  vi.spyOn(sequenceService, "list").mockResolvedValue(emptyListResult as never)
  vi.spyOn(flowService, "list").mockResolvedValue(emptyListResult as never)
})

describe("getCapabilities", () => {
  test("omitting `include` fetches exactly the default set — flow-authoring essentials plus reference lists, not aiAgents", async () => {
    const result = await getCapabilities({ workspaceId: "ws-1" })

    expect(inboxService.list).toHaveBeenCalledTimes(1)
    expect(whatsappMessageTemplateService.list).toHaveBeenCalledTimes(1)
    expect(customFieldService.list).toHaveBeenCalledTimes(1)
    expect(botFieldService.list).toHaveBeenCalledTimes(1)
    expect(tagService.listActive).toHaveBeenCalledTimes(1)
    expect(sequenceService.list).toHaveBeenCalledTimes(1)
    expect(flowService.list).toHaveBeenCalledTimes(1)
    expect(aiAgentService.listAIAgents).not.toHaveBeenCalled()
    expect(result.aiAgents).toBeUndefined()
    expect(result.flowSpec).toBeDefined()
  })

  test("`include` dispatches only the requested loaders", async () => {
    const result = await getCapabilities({
      workspaceId: "ws-1",
      include: ["aiAgents"],
    })

    expect(aiAgentService.listAIAgents).toHaveBeenCalledTimes(1)
    expect(inboxService.list).not.toHaveBeenCalled()
    expect(whatsappMessageTemplateService.list).not.toHaveBeenCalled()
    expect(customFieldService.list).not.toHaveBeenCalled()
    expect(botFieldService.list).not.toHaveBeenCalled()
    expect(tagService.listActive).not.toHaveBeenCalled()
    expect(sequenceService.list).not.toHaveBeenCalled()
    expect(flowService.list).not.toHaveBeenCalled()
    expect(result.inboxes).toBeUndefined()
    expect(result.aiAgents).toEqual([])
  })

  test("truncates a workspace's tags/templates at CAPABILITIES_LIST_LIMIT (200) — this LLM-facing response must never grow unbounded", async () => {
    const manyTags = Array.from({ length: 250 }, (_, i) => ({
      id: `tag-${i}`,
      name: `Tag ${i}`,
    }))
    const manyTemplates = Array.from({ length: 250 }, (_, i) => ({
      id: `tpl-${i}`,
      name: `Template ${i}`,
      language: "en",
      status: "APPROVED",
      components: [],
    }))
    vi.spyOn(tagService, "listActive").mockResolvedValue(manyTags as never)
    vi.spyOn(whatsappMessageTemplateService, "list").mockResolvedValue(
      manyTemplates as never,
    )

    const result = await getCapabilities({
      workspaceId: "ws-1",
      include: ["tags", "templates"],
    })

    expect(result.tags).toHaveLength(200)
    expect(result.templates).toHaveLength(200)
  })

  test("DEFAULT_INCLUDES is every CAPABILITIES_INCLUDES entry except the opt-in ones (aiAgents)", () => {
    expect(OPT_IN_INCLUDES).toEqual(["aiAgents"])
    expect(DEFAULT_INCLUDES).toEqual(
      CAPABILITIES_INCLUDES.filter((include) => include !== "aiAgents"),
    )
    expect(DEFAULT_INCLUDES).not.toContain("aiAgents")
  })

  test("response satisfies the shared capabilitiesResponseSchema", async () => {
    vi.spyOn(inboxService, "list").mockResolvedValue({
      data: [{ id: "1", name: "Support", channel: "messenger" }],
      pageCount: 1,
    } as never)
    vi.spyOn(whatsappMessageTemplateService, "list").mockResolvedValue([
      {
        id: "2",
        name: "welcome_promo",
        language: "en",
        status: "APPROVED",
        components: [],
      },
    ] as never)
    vi.spyOn(tagService, "listActive").mockResolvedValue([
      { id: "3", name: "vip" },
    ] as never)
    vi.spyOn(aiAgentService, "listAIAgents").mockResolvedValue({
      data: [{ id: "4", name: "Support agent" }],
      pageCount: 1,
    } as never)

    const result = await getCapabilities({
      workspaceId: "ws-1",
      include: CAPABILITIES_INCLUDES,
    })

    expect(capabilitiesResponseSchema.safeParse(result).success).toBe(true)
  })
})

describe("getFlowAuthoringContext", () => {
  test("returns only templatesByName/customFieldsByName/flowsByName, each keyed by name", async () => {
    vi.spyOn(whatsappMessageTemplateService, "list").mockResolvedValue([
      {
        id: "1001",
        name: "welcome_promo",
        language: "en",
        status: "APPROVED",
        components: [],
      },
    ] as never)
    vi.spyOn(customFieldService, "list").mockResolvedValue({
      data: [{ id: "1002", name: "Plan", type: "text" }],
      pageCount: 1,
    } as never)
    vi.spyOn(flowService, "list").mockResolvedValue({
      data: [{ id: "1003", name: "Nurture" }],
      pageCount: 1,
    } as never)

    const ctx = await getFlowAuthoringContext("ws-1")

    expect(Object.keys(ctx).sort()).toEqual(
      ["customFieldsByName", "flowsByName", "templatesByName"].sort(),
    )
    expect(ctx.templatesByName.get("welcome_promo")).toEqual({
      id: "1001",
      language: "en",
      status: "APPROVED",
    })
    expect(ctx.customFieldsByName.get("Plan")).toEqual({
      id: "1002",
      type: "text",
    })
    expect(ctx.flowsByName.get("Nurture")).toEqual({ id: "1003" })
    // Neither queried nor exposed — the compiler no longer resolves
    // tag/inbox names, so gathering them here would be wasted work.
    expect(inboxService.list).not.toHaveBeenCalled()
    expect(tagService.listActive).not.toHaveBeenCalled()
  })
})
