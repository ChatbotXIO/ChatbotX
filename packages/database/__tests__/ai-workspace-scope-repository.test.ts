import { describe, expect, test, vi } from "vitest"
import {
  AI_WORKSPACE_SCOPES,
  type AiWorkspaceScope,
  AiWorkspaceScopeRepository,
} from "../src/repositories/ai-workspace-scope"

/** The Drizzle model each scope must read, mirrored here so a re-point is caught. */
const modelByScope: Record<AiWorkspaceScope, string> = {
  aiEmbedding: "aiEmbeddingModel",
  aiFile: "aiFileModel",
  conversationEmbedding: "aiConversationEmbeddingModel",
  conversationSource: "aiConversationSourceModel",
}

const clientReading = (model: string, findFirst: ReturnType<typeof vi.fn>) =>
  ({ query: { [model]: { findFirst } } }) as never

describe("AiWorkspaceScopeRepository", () => {
  test.each(
    AI_WORKSPACE_SCOPES,
  )("resolves the owning workspace for the %s scope", async (scope) => {
    const findFirst = vi.fn().mockResolvedValue({ workspaceId: "ws-1" })
    const repository = new AiWorkspaceScopeRepository(
      clientReading(modelByScope[scope], findFirst),
    )

    await expect(
      repository.findWorkspaceId({ id: "record-1", scope }),
    ).resolves.toBe("ws-1")

    // Only the tenant column: these lookups sit in front of every AI job, so
    // they must never widen into a full row read.
    expect(findFirst).toHaveBeenCalledWith({
      columns: { workspaceId: true },
      where: { id: "record-1" },
    })
  })

  test("returns undefined when the record no longer exists", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined)
    const repository = new AiWorkspaceScopeRepository(
      clientReading("aiFileModel", findFirst),
    )

    await expect(
      repository.findWorkspaceId({ id: "purged", scope: "aiFile" }),
    ).resolves.toBeUndefined()
  })

  test("declares a model for every scope it exposes", () => {
    // Completeness guard: adding a scope without a reader (or without a case in
    // the table above) fails here instead of silently resolving to undefined.
    expect(Object.keys(modelByScope).sort()).toEqual(
      [...AI_WORKSPACE_SCOPES].sort(),
    )
  })
})
