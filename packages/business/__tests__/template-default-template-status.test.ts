// @vitest-environment node

import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { describe, expect, test } from "vitest"
import { resolveDefaultTemplateStatus } from "../src/template/default-template-status"

const TENANT = "10"
const KEY = "template-key-value"

const configFor = async (
  overrides: Partial<{
    tenantId: string
    deletedAt: Date | null
    shareEnabled: boolean
    shareExpiresAt: Date | null
    shareToken: string
    keyHash: string
  }> = {},
) => ({
  keyHash: overrides.keyHash ?? (await sha256Hex(KEY)),
  template: {
    id: "1",
    tenantId: overrides.tenantId ?? TENANT,
    name: "Template",
    workspaceId: "2",
    formatVersion: 1,
    version: 3,
    updatedAt: new Date(),
    deletedAt: overrides.deletedAt ?? null,
    shareEnabled: overrides.shareEnabled ?? true,
    shareExpiresAt: overrides.shareExpiresAt ?? null,
    shareToken: overrides.shareToken ?? KEY,
    defaultPermissions: { allowEdit: true, allowDelete: true },
    defaultAutoUpdate: false,
  },
})

describe("resolveDefaultTemplateStatus", () => {
  test("is ready when the template is live, shared and the key matches", async () => {
    expect(await resolveDefaultTemplateStatus(TENANT, await configFor())).toBe(
      "ready",
    )
  })

  test("reports a deleted template as unavailable", async () => {
    const config = await configFor({ deletedAt: new Date() })
    expect(await resolveDefaultTemplateStatus(TENANT, config)).toBe(
      "templateUnavailable",
    )
  })

  test("reports another tenant's template as unavailable, never as a distinct state", async () => {
    const config = await configFor({ tenantId: "99" })
    expect(await resolveDefaultTemplateStatus(TENANT, config)).toBe(
      "templateUnavailable",
    )
  })

  test("reports a switched-off share", async () => {
    const config = await configFor({ shareEnabled: false })
    expect(await resolveDefaultTemplateStatus(TENANT, config)).toBe(
      "shareDisabled",
    )
  })

  test("reports an expired share", async () => {
    const config = await configFor({ shareExpiresAt: new Date(Date.now() - 1) })
    expect(await resolveDefaultTemplateStatus(TENANT, config)).toBe(
      "shareDisabled",
    )
  })

  test("reports a rotated key", async () => {
    const rotated = await configFor({ shareToken: "a-new-token" })
    expect(await resolveDefaultTemplateStatus(TENANT, rotated)).toBe(
      "keyRotated",
    )
  })
})
