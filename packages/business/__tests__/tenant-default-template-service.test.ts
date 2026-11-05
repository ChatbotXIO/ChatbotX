// @vitest-environment node

import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  encryptText: vi.fn(),
  decryptText: vi.fn(),
  findWithTemplate: vi.fn(),
  findByIdForTenant: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  recordEvent: vi.fn(),
  findByOwner: vi.fn(),
  transaction: vi.fn(),
}))

const tx = { tx: true }

vi.mock("@chatbotx.io/database/partials", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  templateRepository: { findByIdForTenant: mocks.findByIdForTenant },
  tenantDefaultTemplateRepository: {
    findWithTemplate: mocks.findWithTemplate,
    upsert: mocks.upsert,
    delete: mocks.remove,
    recordEvent: mocks.recordEvent,
  },
}))
vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: {
    encryptText: mocks.encryptText,
    decryptText: mocks.decryptText,
  },
}))
vi.mock("../src/enterprise/tenant/service", () => ({
  tenantService: {
    findByOwner: mocks.findByOwner,
  },
}))

const { tenantDefaultTemplateService } = await import(
  "../src/enterprise/tenant/default-template.service"
)

const KEY = "the-share-token"
const owner = { kind: "owner", ownerId: "7" } as const
const template = (over: Record<string, unknown> = {}) => ({
  id: "55",
  shareToken: KEY,
  shareEnabled: true,
  shareExpiresAt: null,
  deletedAt: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation((run: (client: unknown) => unknown) =>
    run(tx),
  )
  mocks.findByOwner.mockResolvedValue({ id: "10" })
  mocks.encryptText.mockResolvedValue({ sealed: true })
})

describe("tenantDefaultTemplateService.set", () => {
  test("stores the digest of the key and the key encrypted for its tenant, never in clear", async () => {
    mocks.findByIdForTenant.mockResolvedValue(template())

    await tenantDefaultTemplateService.set({
      scope: owner,
      templateId: "55",
      templateKey: KEY,
      actorUserId: "admin-1",
    })

    expect(mocks.findByIdForTenant).toHaveBeenCalledWith({
      tenantId: "10",
      id: "55",
    })
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        tenantId: "10",
        templateId: "55",
        keyHash: await sha256Hex(KEY),
        encryptedKey: { sealed: true },
      },
      tx,
    )
  })

  test("records who set it, in the same transaction as the change", async () => {
    mocks.findByIdForTenant.mockResolvedValue(template())

    await tenantDefaultTemplateService.set({
      scope: owner,
      templateId: "55",
      templateKey: KEY,
      actorUserId: "admin-1",
    })

    expect(mocks.recordEvent).toHaveBeenCalledWith(
      {
        tenantId: "10",
        action: "set",
        templateId: "55",
        actorUserId: "admin-1",
      },
      tx,
    )
  })

  test("uses the root tenant for the root scope without a lookup", async () => {
    mocks.findByIdForTenant.mockResolvedValue(template())

    await tenantDefaultTemplateService.set({
      scope: { kind: "root" },
      templateId: "55",
      templateKey: KEY,
      actorUserId: "admin-1",
    })

    expect(mocks.findByOwner).not.toHaveBeenCalled()
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "1" }),
      tx,
    )
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "1", actorUserId: "admin-1" }),
      tx,
    )
  })

  test("never provisions a tenant: an owner without one is refused", async () => {
    mocks.findByOwner.mockResolvedValue(undefined)

    await expect(
      tenantDefaultTemplateService.set({
        scope: owner,
        templateId: "55",
        templateKey: KEY,
        actorUserId: "admin-1",
      }),
    ).rejects.toMatchObject({ code: "tenantDefaultTemplateUnavailable" })
    expect(mocks.findByIdForTenant).not.toHaveBeenCalled()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test.each([
    ["a missing or other-tenant template", undefined, KEY],
    ["a deleted template", template({ deletedAt: new Date() }), KEY],
    ["a wrong key", template(), "not-the-key"],
  ])("answers %s with the one generic error", async (_name, found, key) => {
    mocks.findByIdForTenant.mockResolvedValue(found)

    await expect(
      tenantDefaultTemplateService.set({
        scope: owner,
        templateId: "55",
        templateKey: key,
        actorUserId: "admin-1",
      }),
    ).rejects.toMatchObject({ code: "tenantDefaultTemplateUnavailable" })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test("reveals a switched-off share only after the key matched", async () => {
    mocks.findByIdForTenant.mockResolvedValue(template({ shareEnabled: false }))

    await expect(
      tenantDefaultTemplateService.set({
        scope: owner,
        templateId: "55",
        templateKey: KEY,
        actorUserId: "admin-1",
      }),
    ).rejects.toMatchObject({ code: "tenantDefaultTemplateShareDisabled" })

    await expect(
      tenantDefaultTemplateService.set({
        scope: owner,
        templateId: "55",
        templateKey: "wrong",
        actorUserId: "admin-1",
      }),
    ).rejects.toMatchObject({ code: "tenantDefaultTemplateUnavailable" })
  })
})

describe("tenantDefaultTemplateService.getSettings", () => {
  test("is empty when nothing is configured", async () => {
    mocks.findWithTemplate.mockResolvedValue(null)

    expect(
      await tenantDefaultTemplateService.getSettings({ scope: owner }),
    ).toBeNull()
  })

  test("is empty for an owner without a tenant", async () => {
    mocks.findByOwner.mockResolvedValue(undefined)

    expect(
      await tenantDefaultTemplateService.getSettings({ scope: owner }),
    ).toBeNull()
    expect(mocks.findWithTemplate).not.toHaveBeenCalled()
  })

  test("a rotated key is reported, and the key the owner saved stays as saved", async () => {
    mocks.decryptText.mockResolvedValue("old-key")
    mocks.findWithTemplate.mockResolvedValue({
      keyHash: await sha256Hex("old-key"),
      encryptedKey: { sealed: true },
      template: template({ tenantId: "10" }),
    })

    const settings = await tenantDefaultTemplateService.getSettings({
      scope: owner,
    })

    expect(settings).toEqual({
      templateId: "55",
      status: "keyRotated",
      templateKey: "old-key",
    })
    expect(mocks.decryptText).toHaveBeenCalledWith(
      { sealed: true },
      "tenantDefaultTemplate:10",
    )
  })
})

describe("tenantDefaultTemplateService.clear", () => {
  test("removes the tenant's row and records who cleared which template", async () => {
    mocks.remove.mockResolvedValue("55")

    await tenantDefaultTemplateService.clear({
      scope: owner,
      actorUserId: "admin-1",
    })

    expect(mocks.remove).toHaveBeenCalledWith("10", tx)
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      {
        tenantId: "10",
        action: "cleared",
        templateId: "55",
        actorUserId: "admin-1",
      },
      tx,
    )
  })

  test("records nothing when there was no default to clear", async () => {
    mocks.remove.mockResolvedValue(null)

    await tenantDefaultTemplateService.clear({
      scope: owner,
      actorUserId: "admin-1",
    })

    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("does nothing for an owner without a tenant", async () => {
    mocks.findByOwner.mockResolvedValue(undefined)

    await tenantDefaultTemplateService.clear({
      scope: owner,
      actorUserId: "admin-1",
    })

    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })
})
