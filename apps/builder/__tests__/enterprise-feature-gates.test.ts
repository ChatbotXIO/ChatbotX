// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAssertEnterpriseFeatures,
  mockUpsertByOwner,
  mockUpsertById,
  mockIsSuperAdmin,
  mockIsPlatformAdmin,
  mockCompileEmailPreview,
  mockAssertCanAccess,
  mockDbFindMany,
  mockDbCount,
} = vi.hoisted(() => ({
  mockAssertEnterpriseFeatures: vi.fn(),
  mockUpsertByOwner: vi.fn(),
  mockUpsertById: vi.fn(),
  mockIsSuperAdmin: vi.fn(() => true),
  mockIsPlatformAdmin: vi.fn(async () => true),
  mockCompileEmailPreview: vi.fn(() => "<html>preview</html>"),
  mockAssertCanAccess: vi.fn(async () => undefined),
  mockDbFindMany: vi.fn(async () => []),
  mockDbCount: vi.fn(async () => 0),
}))

const enterpriseFeatureRequired = () =>
  Object.assign(new Error("This feature requires an enterprise license"), {
    code: "enterpriseFeatureRequired",
    httpStatusCode: 403,
  })

vi.mock("@chatbotx.io/business", () => ({
  assertEnterpriseFeatures: mockAssertEnterpriseFeatures,
  isPlatformAdmin: mockIsPlatformAdmin,
  isSuperAdmin: mockIsSuperAdmin,
  tenantService: {
    upsertByOwner: mockUpsertByOwner,
    upsertById: mockUpsertById,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  auditLogModel: {},
  errorLogModel: {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { auditLogModel: { findMany: mockDbFindMany } },
    $count: mockDbCount,
  },
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(() => ({ limit: 10, offset: 0 })),
  parseOrderByAsObject: vi.fn(() => undefined),
}))

vi.mock("@chatbotx.io/mail/preview", () => ({
  compileEmailPreview: mockCompileEmailPreview,
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mockAssertCanAccess,
}))

vi.mock("@/lib/safe-action", () => {
  const makeClient = () => {
    const chain: Record<string, unknown> = {}
    chain.bindArgsSchemas = () => chain
    chain.inputSchema = () => chain
    chain.action = (fn: unknown) => fn
    return chain
  }
  return {
    authActionClient: makeClient(),
    platformAdminActionClient: makeClient(),
    superAdminActionClient: makeClient(),
  }
})

type Action = (props: unknown) => Promise<unknown>

const { updatePlatformBrandingAction, updateRootPlatformBrandingAction } =
  await import(
    "../src/enterprise/features/platform-branding/update-platform-branding.action"
  )
const { updateEmailTemplateAction, updateRootEmailTemplateAction } =
  await import(
    "../src/enterprise/features/platform-email-templates/update-email-template.action"
  )
const { previewEmailTemplateAction } = await import(
  "../src/enterprise/features/platform-email-templates/preview-email-template.action"
)
const { listAuditLogs } = await import(
  "../src/enterprise/features/audit-logs/queries"
)

const brandingInput = {
  ctx: { user: { id: "user-1" } },
  parsedInput: {
    brandName: "Evil Rebrand",
    logoLight: { url: "" },
    logoDark: { url: "" },
    favicon: { url: "" },
  },
}

const templateInput = {
  ctx: { user: { id: "user-1" } },
  parsedInput: { type: "signup", subject: "s", body: "b" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertEnterpriseFeatures.mockRejectedValue(enterpriseFeatureRequired())
  mockIsSuperAdmin.mockReturnValue(true)
  mockIsPlatformAdmin.mockResolvedValue(true)
})

describe("enterprise mutations reject without a valid license", () => {
  test.each([
    ["updatePlatformBrandingAction", updatePlatformBrandingAction],
    ["updateRootPlatformBrandingAction", updateRootPlatformBrandingAction],
  ])("%s throws enterpriseFeatureRequired and writes nothing", async (_, action) => {
    await expect((action as Action)(brandingInput)).rejects.toMatchObject({
      code: "enterpriseFeatureRequired",
    })
    expect(mockUpsertByOwner).not.toHaveBeenCalled()
    expect(mockUpsertById).not.toHaveBeenCalled()
  })

  test.each([
    ["updateEmailTemplateAction", updateEmailTemplateAction],
    ["updateRootEmailTemplateAction", updateRootEmailTemplateAction],
  ])("%s throws enterpriseFeatureRequired and writes nothing", async (_, action) => {
    await expect((action as Action)(templateInput)).rejects.toMatchObject({
      code: "enterpriseFeatureRequired",
    })
    expect(mockUpsertByOwner).not.toHaveBeenCalled()
    expect(mockUpsertById).not.toHaveBeenCalled()
  })

  test("previewEmailTemplateAction throws before compiling", async () => {
    await expect(
      (previewEmailTemplateAction as Action)({
        ctx: { user: { id: "user-1" } },
        parsedInput: { body: "<b>x</b>" },
      }),
    ).rejects.toMatchObject({ code: "enterpriseFeatureRequired" })
    expect(mockCompileEmailPreview).not.toHaveBeenCalled()
  })

  test("listAuditLogs throws before touching auth or the database", async () => {
    await expect(
      listAuditLogs({ workspaceId: "ws-1" } as never),
    ).rejects.toMatchObject({ code: "enterpriseFeatureRequired" })
    expect(mockAssertCanAccess).not.toHaveBeenCalled()
    expect(mockDbFindMany).not.toHaveBeenCalled()
  })
})

describe("enterprise mutations proceed with a valid license", () => {
  beforeEach(() => {
    mockAssertEnterpriseFeatures.mockResolvedValue(undefined)
  })

  test("updatePlatformBrandingAction writes the tenant branding", async () => {
    await (updatePlatformBrandingAction as Action)(brandingInput)

    expect(mockUpsertByOwner).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ brandName: "Evil Rebrand" }),
    )
  })

  test("updateRootEmailTemplateAction writes the root tenant template", async () => {
    await (updateRootEmailTemplateAction as Action)(templateInput)

    expect(mockUpsertById).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({
        signupEmailTemplate: { subject: "s", body: "b" },
      }),
    )
  })

  test("listAuditLogs returns rows", async () => {
    await expect(
      listAuditLogs({ workspaceId: "ws-1" } as never),
    ).resolves.toEqual({ data: [], pageCount: 0 })
    expect(mockAssertCanAccess).toHaveBeenCalled()
  })
})
