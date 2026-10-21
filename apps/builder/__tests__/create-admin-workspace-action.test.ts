// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(),
  assertEnterpriseFeatures: vi.fn(),
  createWithMembers: vi.fn(),
  isCommunity: vi.fn().mockReturnValue(false),
  findOrFail: vi.fn(),
  isDatabaseError: vi.fn().mockReturnValue(false),
  getCurrentUserId: vi.fn().mockResolvedValue("admin-1"),
  getAllWorkspaceMembers: vi.fn(),
  checkWorkspaceOwnerAccess: vi.fn().mockResolvedValue(null),
}))

vi.mock("@chatbotx.io/business", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
  assertEnterpriseFeatures: mocks.assertEnterpriseFeatures,
  adminWorkspaceService: { createWithMembers: mocks.createWithMembers },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  getAuditActor: () => undefined,
  withAuditContext: (_actor: unknown, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: mocks.findOrFail,
  isDatabaseError: mocks.isDatabaseError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  userModel: {},
}))

vi.mock("@/env", () => ({
  isCommunity: mocks.isCommunity,
}))

vi.mock("@/features/workspace-members/queries", () => ({
  getAllWorkspaceMembers: mocks.getAllWorkspaceMembers,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))

vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess: mocks.checkWorkspaceOwnerAccess,
  workspaceAccessDenialException: (reason: string) => new Error(reason),
}))

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "user-agent": "vitest", "x-forwarded-for": "203.0.113.9" }),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}))

const { createAdminWorkspaceAction } = await import(
  "../src/enterprise/features/admin-workspaces/create-admin-workspace.action"
)

type ActionResult = { data?: unknown; serverError?: string }
type Action = (input: unknown) => Promise<ActionResult>

const validInput = {
  name: "New Workspace",
  ownerEmail: "owner@example.com",
  memberEmails: ["member@example.com"],
  permissions: {
    superAdmin: true,
    analytics: true,
    flows: true,
    contacts: true,
    onlyAssignedContacts: true,
    emailAndPhone: true,
    broadcast: true,
    ecommerce: true,
  },
}

const callAction = (input: unknown) =>
  (createAdminWorkspaceAction as unknown as Action)(input)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isSuperAdmin.mockResolvedValue(true)
  mocks.assertEnterpriseFeatures.mockResolvedValue(undefined)
  mocks.isCommunity.mockReturnValue(false)
  mocks.findOrFail.mockResolvedValue({
    id: "admin-1",
    mustChangePassword: false,
  })
  mocks.createWithMembers.mockResolvedValue({
    workspace: { id: "ws-1" },
    owner: { email: "owner@example.com", userId: "owner-1", created: false },
    members: [],
  })
})

describe("createAdminWorkspaceAction", () => {
  test("rejects a caller who is not a super admin", async () => {
    mocks.isSuperAdmin.mockResolvedValue(false)

    const result = await callAction(validInput)

    expect(result.serverError).toBeTruthy()
    expect(mocks.createWithMembers).not.toHaveBeenCalled()
  })

  test("rejects without a valid enterprise license", async () => {
    mocks.assertEnterpriseFeatures.mockRejectedValue(
      new ChatbotXException(
        "This feature requires an enterprise license",
        "enterpriseFeatureRequired",
        403,
      ),
    )

    const result = await callAction(validInput)

    expect(result.serverError).toBe(
      "This feature requires an enterprise license",
    )
    expect(mocks.createWithMembers).not.toHaveBeenCalled()
  })

  test("calls adminWorkspaceService.createWithMembers with the acting admin and parsed input", async () => {
    await callAction(validInput)

    expect(mocks.assertEnterpriseFeatures).toHaveBeenCalled()
    expect(mocks.createWithMembers).toHaveBeenCalledWith({
      actorId: "admin-1",
      name: "New Workspace",
      ownerEmail: "owner@example.com",
      memberEmails: ["member@example.com"],
      permissions: validInput.permissions,
    })
  })

  test("forces full permissions on community even though the enterprise gate already blocks this path", async () => {
    mocks.isCommunity.mockReturnValue(true)

    await callAction(validInput)

    expect(mocks.createWithMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: expect.objectContaining({ superAdmin: true }),
      }),
    )
  })
})
