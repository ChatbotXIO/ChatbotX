// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { contactRepository } from "../src/repositories/contact/repository"

const renderSql = (query: unknown): string => {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child)
      }
      return
    }
    if (typeof node === "string" || typeof node === "number") {
      parts.push(String(node))
      return
    }
    if (!node || typeof node !== "object") {
      return
    }
    const entry = node as Record<string, unknown>
    if (Array.isArray(entry.queryChunks)) {
      walk(entry.queryChunks)
      return
    }
    if ("value" in entry) {
      walk(entry.value)
    }
  }
  walk((query as { queryChunks?: unknown }).queryChunks)
  return parts.join("").replace(/\s+/g, " ").trim()
}

describe("contactRepository.bulkPatchProfiles", () => {
  test("updates profiles through one workspace-scoped VALUES statement only while both names are null", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })

    await contactRepository.bulkPatchProfiles(
      {
        workspaceId: "100",
        profiles: [
          {
            contactId: "200",
            firstName: "Ada",
            lastName: "Lovelace",
            gender: "female",
            locale: "en_GB",
            timezone: "Europe/London",
          },
          { contactId: "201", firstName: "Grace", lastName: "Hopper" },
        ],
      },
      { execute } as unknown as DatabaseClient,
    )

    expect(execute).toHaveBeenCalledOnce()
    const statement = renderSql(execute.mock.calls[0]?.[0])
    expect(statement).toContain('UPDATE "Contact" AS t')
    expect(statement).toContain("FROM (VALUES")
    expect(statement).toContain("200::bigint")
    expect(statement).toContain("201::bigint")
    expect(statement).toContain('WHERE t."workspaceId" = 100')
    expect(statement).toContain('AND t."id" = v."id"')
    expect(statement).toContain('AND t."firstName" IS NULL')
    expect(statement).toContain('AND t."lastName" IS NULL')
  })

  test("does not query for an empty profile list", async () => {
    const execute = vi.fn()

    await contactRepository.bulkPatchProfiles(
      { workspaceId: "100", profiles: [] },
      { execute } as unknown as DatabaseClient,
    )

    expect(execute).not.toHaveBeenCalled()
  })
})
