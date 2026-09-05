import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

const apiSource = readFileSync(
  "src/features/integration-klaviyo/api/index.ts",
  "utf8",
)
const editorSource = readFileSync(
  "src/features/flows/react-flow/steps/klaviyo-sync-profile/editor.tsx",
  "utf8",
)

describe("Klaviyo API registration", () => {
  test("keeps list resources workspace-authorized and bounded", () => {
    expect(apiSource).toContain(
      'path: "/workspaces/{workspaceId}/klaviyo/lists"',
    )
    expect(apiSource).not.toContain(
      'path: "/workspaces/{workspaceId}/klaviyo/tags"',
    )
    expect(apiSource.match(/workspaceAuthorizedMidddleware/gu)?.length).toBe(2)
    expect(apiSource).toContain("createPageInput(KLAVIYO_LIST_PAGE_SIZE)")
    expect(apiSource).toContain("cursor: z.string().trim().min(1).optional()")
  })

  test("maps provider rate limits without exposing provider errors", () => {
    expect(apiSource).toContain('new ORPCError("TOO_MANY_REQUESTS"')
    expect(apiSource).toContain("Klaviyo rate limit exceeded")
  })

  test("loads provider pages sequentially without blocking the inputs", () => {
    expect(editorSource).toContain("fetchAllPages")
    expect(editorSource).toContain("nextPageParam: page.nextCursor")
    expect(editorSource).not.toContain('t("klaviyo.lists.loading")')
    expect(editorSource).not.toContain('name="tagIds"')
  })
})
