// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { resolveTemplateParams } = vi.hoisted(() => ({
  resolveTemplateParams: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({ resolveTemplateParams }))
vi.mock("@chatbotx.io/business/errors", () => ({
  validationException: (field: string, message: string) =>
    Object.assign(new Error(message), { code: "validation", field }),
}))

const { resolvePublicBroadcastTemplateParams } = await import(
  "@/features/broadcasts/lib/resolve-public-template-params"
)
const { createBroadcastPublicRequest } = await import(
  "@/features/broadcasts/schema/public"
)

const base = {
  channel: "whatsapp" as const,
  subaction: "whatsappTemplateMessage" as const,
  schedulesType: "now" as const,
  schedulesAt: null,
  contactFilter: { operator: "and" as const, conditions: [] },
  saveAsDraft: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveTemplateParams.mockResolvedValue({ body: [{ text: "Ann" }] })
})

describe("resolvePublicBroadcastTemplateParams", () => {
  test("turns top-level templateParams into templateData", async () => {
    const result = await resolvePublicBroadcastTemplateParams({
      workspaceId: "ws-1",
      request: {
        ...base,
        templateId: "t-1",
        templateParams: { "body.1": "Ann" },
      },
    })

    expect(resolveTemplateParams).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
      templateId: "t-1",
      values: { "body.1": "Ann" },
      field: "templateParams",
    })
    expect(result.templateData).toEqual({ body: [{ text: "Ann" }] })
    expect(result).not.toHaveProperty("templateParams")
  })

  test("resolves each target with its own template and error path", async () => {
    const result = await resolvePublicBroadcastTemplateParams({
      workspaceId: "ws-1",
      request: {
        ...base,
        targets: [
          {
            inboxId: "1",
            templateId: "t-1",
            templateParams: { "body.1": "A" },
          },
          { inboxId: "2", flowId: "9" },
        ],
      },
    })

    expect(resolveTemplateParams).toHaveBeenCalledOnce()
    expect(resolveTemplateParams).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "t-1",
        field: "targets.0.templateParams",
      }),
    )
    expect(result.targets).toEqual([
      {
        inboxId: "1",
        templateId: "t-1",
        templateData: { body: [{ text: "Ann" }] },
      },
      { inboxId: "2", flowId: "9", templateData: undefined },
    ])
  })

  test("templateParams without a templateId is a 422", async () => {
    await expect(
      resolvePublicBroadcastTemplateParams({
        workspaceId: "ws-1",
        request: { ...base, flowId: "9", templateParams: { "body.1": "A" } },
      }),
    ).rejects.toMatchObject({ code: "validation", field: "templateParams" })
  })

  test("a caller-built templateData passes through untouched", async () => {
    const templateData = { body: [{ type: "text" as const, text: "Raw" }] }
    const result = await resolvePublicBroadcastTemplateParams({
      workspaceId: "ws-1",
      request: { ...base, templateId: "t-1", templateData },
    })

    expect(resolveTemplateParams).not.toHaveBeenCalled()
    expect(result.templateData).toBe(templateData)
  })
})

describe("createBroadcastPublicRequest", () => {
  test("accepts templateParams", () => {
    expect(
      createBroadcastPublicRequest.safeParse({
        ...base,
        templateId: "1",
        integrationWhatsappId: "2",
        inboxIds: ["3"],
        templateParams: { "body.1": "Ann" },
      }).success,
    ).toBe(true)
  })

  test("refuses templateParams together with templateData", () => {
    const result = createBroadcastPublicRequest.safeParse({
      ...base,
      templateId: "1",
      integrationWhatsappId: "2",
      inboxIds: ["3"],
      templateParams: { "body.1": "Ann" },
      templateData: { body: [{ type: "text", text: "Ann" }] },
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual([
      "templateParams",
    ])
  })
})
