// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { createAdsConversionRuleAction } from "../src/features/ads/actions/conversion-rule"
import { retargetAdAction } from "../src/features/ads/actions/retarget"

type CreateAdsConversionRuleActionArgs = {
  bindArgsParsedInputs: readonly [string]
  ctx: { workspace: { id: string; ownerId: string } }
  parsedInput: {
    channel: "whatsapp" | "messenger" | "instagram"
    integrationWhatsappId?: string | null
    integrationFacebookAdsId: null
    integrationMessengerId?: string | null
    integrationInstagramId?: string | null
    adAccountId: null
    eventType: "lead" | "purchase"
    trigger:
      | { type: "templateSent"; templateIds: string[] }
      | { type: "tagApplied"; tagIds: string[] }
    markAs: string | null
    enabled: boolean
  }
}

type CreateAdsConversionRuleActionHandler = (
  args: CreateAdsConversionRuleActionArgs,
) => Promise<unknown>

type RetargetAdActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  ctx: { workspace: { id: string; ownerId: string } }
  parsedInput: {
    segment: "conversations"
    since: string
    until: string
    adAccountId: string
    audienceName?: string
    customAudienceId?: string
    channel?: "whatsapp" | "messenger" | "instagram"
    integrationWhatsappId?: string
    integrationMessengerId?: string
    integrationInstagramId?: string
  }
}) => Promise<unknown>

const { createRuleMock, getCurrentUserAndTargetWorkspaceMock } = vi.hoisted(
  () => ({
    createRuleMock: vi.fn(),
    getCurrentUserAndTargetWorkspaceMock: vi.fn(),
  }),
)

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: CreateAdsConversionRuleActionHandler) => handler
  return { workspaceActionClient: chain }
})

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: getCurrentUserAndTargetWorkspaceMock,
}))

vi.mock("@chatbotx.io/business", async () => {
  const { z } = await import("zod")
  const trigger = z.discriminatedUnion("type", [
    z.object({
      type: z.literal("templateSent"),
      templateIds: z.array(z.string()).min(1),
    }),
    z.object({
      type: z.literal("tagApplied"),
      tagIds: z.array(z.string()).min(1),
    }),
    z.object({
      type: z.literal("keywordMatched"),
      automatedResponseIds: z.array(z.string()).min(1),
    }),
    z.object({
      type: z.literal("contactReplied"),
      firstReplyOnly: z.boolean(),
    }),
  ])
  const baseRule = z.object({
    id: z.string(),
    workspaceId: z.string(),
    channel: z.enum(["whatsapp", "facebook", "messenger", "instagram"]),
    integrationWhatsappId: z.string().nullable(),
    integrationFacebookAdsId: z.string().nullable(),
    adAccountId: z.string().nullable(),
    eventType: z.enum(["lead", "purchase"]),
    trigger,
    markAs: z.string().nullable(),
    enabled: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  const createInput = z.object({
    workspaceId: z.string(),
    channel: z.enum(["whatsapp", "facebook", "messenger", "instagram"]),
    integrationWhatsappId: z.string().nullable().optional(),
    integrationFacebookAdsId: z.string().nullable().optional(),
    adAccountId: z.string().nullable().optional(),
    eventType: z.enum(["lead", "purchase"]),
    trigger,
    markAs: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
  })

  return {
    adsConversionRuleResource: baseRule,
    adsConversionService: {
      create: createRuleMock,
    },
    buildContext: vi.fn(),
    integrationFacebookAdsService: {
      findByWorkspaceIdOrFail: vi.fn(),
    },
    createAdsConversionRuleInput: createInput,
    listAdsConversionRulesInput: z.object({
      workspaceId: z.string(),
      channel: z
        .enum(["whatsapp", "facebook", "messenger", "instagram"])
        .optional(),
    }),
    removeAdsConversionRuleInput: z.object({
      id: z.string(),
      workspaceId: z.string(),
    }),
    toggleAdsConversionRuleInput: z.object({
      id: z.string(),
      workspaceId: z.string(),
      enabled: z.boolean(),
    }),
    updateAdsConversionRuleInput: createInput.partial().extend({
      id: z.string(),
      workspaceId: z.string(),
    }),
  }
})

vi.mock("@chatbotx.io/encryption", () => ({
  encryptedDataSchema: { parse: vi.fn((value: unknown) => value) },
  encryptUtils: {
    decryptObject: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/integration-facebook-ads", () => ({
  facebookAdsAuthSchema: {},
  integration: { runAction: vi.fn() },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    syncRetargetAudience: "syncRetargetAudience",
  },
  enqueueIntegrationJob: vi.fn(),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

const NOT_SUPPORTED_FOR_INSTAGRAM = /not supported for channel "instagram"/
const INTEGRATION_MUST_MATCH = /integration must match/

const callCreateAdsConversionRuleAction =
  createAdsConversionRuleAction as unknown as CreateAdsConversionRuleActionHandler
const callRetargetAdAction =
  retargetAdAction as unknown as RetargetAdActionHandler

const { integrationFacebookAdsService } = await import("@chatbotx.io/business")
const { encryptUtils } = await import("@chatbotx.io/encryption")
const { enqueueIntegrationJob } = await import("@chatbotx.io/worker-config")
const mockFindFacebookAdsIntegration =
  integrationFacebookAdsService.findByWorkspaceIdOrFail as ReturnType<
    typeof vi.fn
  >
const mockDecryptObject = encryptUtils.decryptObject as ReturnType<typeof vi.fn>
const mockEnqueueRetargetJob = enqueueIntegrationJob as ReturnType<typeof vi.fn>

describe("ads conversion rule actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("rejects non-super-admin members before creating a conversion rule", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: false,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })

    await expect(
      callCreateAdsConversionRuleAction({
        bindArgsParsedInputs: ["ws-1"],
        ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
        parsedInput: {
          channel: "whatsapp",
          integrationWhatsappId: "iw-1",
          integrationFacebookAdsId: null,
          adAccountId: null,
          eventType: "lead",
          trigger: { type: "templateSent", templateIds: ["template-1"] },
          markAs: "deal_won",
          enabled: true,
        },
      }),
    ).rejects.toThrow("errors.superAdminRequired")

    expect(createRuleMock).not.toHaveBeenCalled()
  })

  test("passes purchase conversion rules through with no markAs value", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: true,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })
    createRuleMock.mockResolvedValue({
      id: "rule-purchase",
      workspaceId: "ws-1",
      channel: "whatsapp",
      integrationWhatsappId: "iw-1",
      integrationFacebookAdsId: null,
      adAccountId: null,
      eventType: "purchase",
      trigger: { type: "templateSent", templateIds: ["template-1"] },
      markAs: null,
      enabled: true,
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    })

    await expect(
      callCreateAdsConversionRuleAction({
        bindArgsParsedInputs: ["ws-1"],
        ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
        parsedInput: {
          channel: "whatsapp",
          integrationWhatsappId: "iw-1",
          integrationFacebookAdsId: null,
          adAccountId: null,
          eventType: "purchase",
          trigger: { type: "templateSent", templateIds: ["template-1"] },
          markAs: null,
          enabled: true,
        },
      }),
    ).resolves.toMatchObject({
      eventType: "purchase",
      markAs: null,
    })

    expect(createRuleMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
      integrationWhatsappId: "iw-1",
      integrationFacebookAdsId: null,
      adAccountId: null,
      eventType: "purchase",
      trigger: { type: "templateSent", templateIds: ["template-1"] },
      markAs: null,
      enabled: true,
    })
  })

  test("creates a keywordMatched trigger rule (Phase 2 trigger type)", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: true,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })
    createRuleMock.mockResolvedValue({
      id: "rule-keyword",
      workspaceId: "ws-1",
      channel: "whatsapp",
      integrationWhatsappId: "iw-1",
      integrationFacebookAdsId: null,
      adAccountId: null,
      eventType: "lead",
      trigger: { type: "keywordMatched", automatedResponseIds: ["ar-1"] },
      markAs: "deal_won",
      enabled: true,
      createdAt: new Date("2026-08-11T00:00:00.000Z"),
      updatedAt: new Date("2026-08-11T00:00:00.000Z"),
    })

    await expect(
      callCreateAdsConversionRuleAction({
        bindArgsParsedInputs: ["ws-1"],
        ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
        parsedInput: {
          channel: "whatsapp",
          integrationWhatsappId: "iw-1",
          integrationFacebookAdsId: null,
          adAccountId: null,
          eventType: "lead",
          trigger: {
            type: "keywordMatched",
            automatedResponseIds: ["ar-1"],
          } as never,
          markAs: "deal_won",
          enabled: true,
        },
      }),
    ).resolves.toMatchObject({
      trigger: { type: "keywordMatched", automatedResponseIds: ["ar-1"] },
    })

    expect(createRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: { type: "keywordMatched", automatedResponseIds: ["ar-1"] },
      }),
    )
  })

  test("rejects non-super-admin members before queueing a retarget sync", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: false,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })

    await expect(
      callRetargetAdAction({
        bindArgsParsedInputs: ["ws-1"],
        ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
        parsedInput: {
          segment: "conversations",
          since: "2026-08-01",
          until: "2026-08-10",
          adAccountId: "act_1",
          audienceName: "CTWA conversations",
        },
      }),
    ).rejects.toThrow("errors.superAdminRequired")
  })

  test("threads channel + integrationMessengerId through the retarget job payload and jobId (Phase 3 widening)", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: true,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })
    mockFindFacebookAdsIntegration.mockResolvedValue({ auth: {} })
    mockDecryptObject.mockResolvedValue({})
    mockEnqueueRetargetJob.mockResolvedValue(undefined)

    await callRetargetAdAction({
      bindArgsParsedInputs: ["ws-1"],
      ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
      parsedInput: {
        segment: "conversations",
        since: "2026-08-01",
        until: "2026-08-10",
        adAccountId: "act_1",
        customAudienceId: "aud-1",
        channel: "messenger",
        integrationMessengerId: "im-1",
      },
    })

    expect(mockEnqueueRetargetJob).toHaveBeenCalledWith(
      {
        type: "syncRetargetAudience",
        data: expect.objectContaining({
          workspaceId: "ws-1",
          customAudienceId: "aud-1",
          segment: "conversations",
          channel: "messenger",
          integrationMessengerId: "im-1",
        }),
      },
      { jobId: expect.stringContaining("messenger") },
    )
    expect(mockEnqueueRetargetJob).toHaveBeenCalledWith(expect.anything(), {
      jobId: expect.stringContaining("im-1"),
    })
  })

  test("threads channel + integrationMessengerId through to adsConversionService.create for a messenger templateSent rule (Phase 5)", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: true,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })
    createRuleMock.mockResolvedValue({
      id: "rule-messenger",
      workspaceId: "ws-1",
      channel: "messenger",
      integrationMessengerId: "im-1",
      integrationFacebookAdsId: null,
      adAccountId: null,
      eventType: "lead",
      trigger: { type: "templateSent", templateIds: ["mt-1"] },
      markAs: "deal_won",
      enabled: true,
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    })

    await expect(
      callCreateAdsConversionRuleAction({
        bindArgsParsedInputs: ["ws-1"],
        ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
        parsedInput: {
          channel: "messenger",
          integrationFacebookAdsId: null,
          integrationMessengerId: "im-1",
          adAccountId: null,
          eventType: "lead",
          trigger: { type: "templateSent", templateIds: ["mt-1"] },
          markAs: "deal_won",
          enabled: true,
        },
      }),
    ).resolves.toMatchObject({ channel: "messenger" })

    expect(createRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        channel: "messenger",
        integrationMessengerId: "im-1",
        trigger: { type: "templateSent", templateIds: ["mt-1"] },
      }),
    )
  })

  test("propagates the business-layer channel×trigger rejection for instagram + templateSent (Phase 5)", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: true,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })
    // Simulates `assertSupportedTrigger` rejecting instagram+templateSent in
    // the real service (packages/business/src/ads-conversion/service.ts) —
    // the action must surface the rejection, not swallow it.
    createRuleMock.mockRejectedValue(
      new Error(
        'Ads conversion trigger type "templateSent" is not supported for channel "instagram"',
      ),
    )

    await expect(
      callCreateAdsConversionRuleAction({
        bindArgsParsedInputs: ["ws-1"],
        ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
        parsedInput: {
          channel: "instagram",
          integrationFacebookAdsId: null,
          integrationInstagramId: "ig-1",
          adAccountId: null,
          eventType: "lead",
          trigger: { type: "templateSent", templateIds: ["t-1"] },
          markAs: "deal_won",
          enabled: true,
        },
      }),
    ).rejects.toThrow(NOT_SUPPORTED_FOR_INSTAGRAM)

    expect(createRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "instagram",
        integrationInstagramId: "ig-1",
      }),
    )
  })

  test("channel/integration consistency errors surface through the action (Phase 5)", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          superAdmin: true,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: false,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })
    // Simulates `assertIntegrationConsistency` rejecting a channel/FK
    // mismatch (e.g. messenger channel with no integrationMessengerId).
    createRuleMock.mockRejectedValue(
      new Error(
        "Ads conversion rule integration must match the selected channel",
      ),
    )

    await expect(
      callCreateAdsConversionRuleAction({
        bindArgsParsedInputs: ["ws-1"],
        ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
        parsedInput: {
          channel: "messenger",
          integrationFacebookAdsId: null,
          integrationMessengerId: null,
          adAccountId: null,
          eventType: "lead",
          trigger: { type: "tagApplied", tagIds: ["tag-1"] },
          markAs: "deal_won",
          enabled: true,
        },
      }),
    ).rejects.toThrow(INTEGRATION_MUST_MATCH)
  })
})
