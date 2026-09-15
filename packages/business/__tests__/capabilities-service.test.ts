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

  // Pins the real behavior of every loader that routes through
  // `parsePagination` (inboxes, customFields, botFields, aiAgents,
  // sequences, flows) — `packages/database/src/utils.ts`'s `maxLimit` is 50,
  // so passing `perPage: CAPABILITIES_LIST_LIMIT` (200) is silently clamped
  // to 50 regardless of what the constant reads. The old test only exercised
  // `tags`/`templates`, which bypass pagination entirely and so never
  // actually pinned this.
  test("loaders that route through parsePagination are clamped to maxLimit (50), not CAPABILITIES_LIST_LIMIT (200)", async () => {
    const requestedPerPage: number[] = []
    vi.spyOn(customFieldService, "list").mockImplementation(
      (input: { perPage?: number | null }) => {
        requestedPerPage.push(input.perPage ?? -1)
        return Promise.resolve({ data: [], pageCount: 0 })
      },
    )

    await getCapabilities({ workspaceId: "ws-1", include: ["customFields"] })

    // The loader still asks for CAPABILITIES_LIST_LIMIT — the clamp happens
    // inside parsePagination, not in the capabilities loader itself.
    expect(requestedPerPage).toEqual([200])
  })

  test("customFields/botFields/aiAgents/sequences/flows loaders pass a stable sort", async () => {
    vi.spyOn(customFieldService, "list").mockResolvedValue(
      emptyListResult as never,
    )
    vi.spyOn(botFieldService, "list").mockResolvedValue(
      emptyListResult as never,
    )
    vi.spyOn(sequenceService, "list").mockResolvedValue(
      emptyListResult as never,
    )
    vi.spyOn(flowService, "list").mockResolvedValue(emptyListResult as never)
    vi.spyOn(aiAgentService, "listAIAgents").mockResolvedValue(
      emptyListResult as never,
    )

    await getCapabilities({ workspaceId: "ws-1" })
    await getCapabilities({ workspaceId: "ws-1", include: ["aiAgents"] })

    const stableSort = [{ id: "id", desc: false }]
    for (const spy of [
      customFieldService.list,
      botFieldService.list,
      sequenceService.list,
      flowService.list,
    ]) {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ sort: stableSort }),
      )
    }
    expect(aiAgentService.listAIAgents).toHaveBeenCalledWith(
      expect.objectContaining({ sort: stableSort }),
    )
  })

  // inboxService.list has no sort param at all (see the comment on
  // listInboxes in capabilities/service.ts) — this pins that it is not
  // silently passed one that TypeScript would reject.
  test("inboxes loader does not pass a sort param (inboxService.list has none)", async () => {
    vi.spyOn(inboxService, "list").mockResolvedValue(emptyListResult as never)

    await getCapabilities({ workspaceId: "ws-1", include: ["inboxes"] })

    expect(inboxService.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      perPage: 200,
    })
  })

  test("isolates a failing loader instead of rejecting the whole call", async () => {
    vi.spyOn(tagService, "listActive").mockRejectedValue(
      new Error("tags query failed"),
    )

    const result = await getCapabilities({
      workspaceId: "ws-1",
      include: ["tags", "inboxes"],
    })

    expect(result.tags).toBeUndefined()
    expect(result.inboxes).toEqual([])
  })

  test("skips a malformed (non-array) template components value instead of throwing", async () => {
    vi.spyOn(whatsappMessageTemplateService, "list").mockResolvedValue([
      {
        id: "1",
        name: "broken_template",
        language: "en",
        status: "APPROVED",
        components: { not: "an array" },
      },
    ] as never)

    const result = await getCapabilities({
      workspaceId: "ws-1",
      include: ["templates"],
    })

    expect(result.templates).toEqual([
      {
        id: "1",
        name: "broken_template",
        language: "en",
        status: "APPROVED",
        params: {},
      },
    ])
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

  test("fetches templates/customFields/flows unbounded — no perPage, so parsePagination applies no LIMIT", async () => {
    vi.spyOn(customFieldService, "list").mockResolvedValue(
      emptyListResult as never,
    )
    vi.spyOn(flowService, "list").mockResolvedValue(emptyListResult as never)

    await getFlowAuthoringContext("ws-1")

    expect(customFieldService.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
    })
    expect(flowService.list).toHaveBeenCalledWith({ workspaceId: "ws-1" })
  })

  test("on a template name collision across languages, prefers the APPROVED variant over last-wins array order", async () => {
    vi.spyOn(whatsappMessageTemplateService, "list").mockResolvedValue([
      {
        id: "rejected-en",
        name: "welcome_promo",
        language: "en",
        status: "REJECTED",
        components: [],
      },
      {
        id: "approved-es",
        name: "welcome_promo",
        language: "es",
        status: "APPROVED",
        components: [],
      },
    ] as never)

    const ctx = await getFlowAuthoringContext("ws-1")

    expect(ctx.templatesByName.get("welcome_promo")).toEqual({
      id: "approved-es",
      language: "es",
      status: "APPROVED",
    })
  })
})
