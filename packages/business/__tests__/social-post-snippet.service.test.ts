import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countByWorkspace: vi.fn(),
  delete: vi.fn(),
  findById: vi.fn(),
  insert: vi.fn(),
  isUniqueViolationError: vi.fn(() => false),
  list: vi.fn(),
  lockWorkspaceSnippets: vi.fn(),
  nextPosition: vi.fn(),
  update: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
  isUniqueViolationError: mocks.isUniqueViolationError,
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostSnippetRepository: {
    countByWorkspace: mocks.countByWorkspace,
    delete: mocks.delete,
    findById: mocks.findById,
    insert: mocks.insert,
    list: mocks.list,
    lockWorkspaceSnippets: mocks.lockWorkspaceSnippets,
    nextPosition: mocks.nextPosition,
    update: mocks.update,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))

const {
  MAX_POST_SNIPPETS_PER_WORKSPACE,
  composeSignedText,
  socialPostSnippetService,
} = await import("../src/social-post-snippet/service")

const snippet = {
  content: "— The Acme team",
  id: "1",
  kind: "signature" as const,
  name: "Sign-off",
  position: 0,
}

describe("socialPostSnippetService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isUniqueViolationError.mockReturnValue(false)
    mocks.countByWorkspace.mockResolvedValue(0)
    mocks.nextPosition.mockResolvedValue(3)
  })

  test("creates a snippet at the end under the workspace lock", async () => {
    mocks.insert.mockResolvedValue(snippet)

    await socialPostSnippetService.create({
      content: snippet.content,
      kind: "signature",
      name: snippet.name,
      workspaceId: "ws-1",
    })

    expect(mocks.lockWorkspaceSnippets).toHaveBeenCalledWith("ws-1", tx)
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ position: 3, workspaceId: "ws-1" }),
      tx,
    )
  })

  test("refuses past the cap", async () => {
    mocks.countByWorkspace.mockResolvedValue(MAX_POST_SNIPPETS_PER_WORKSPACE)

    await expect(
      socialPostSnippetService.create({
        content: "x",
        kind: "text",
        name: "n",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("at most")
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("answers snippetNameTaken for a duplicate name on create and update", async () => {
    mocks.insert.mockResolvedValue(null)
    await expect(
      socialPostSnippetService.create({
        content: "x",
        kind: "text",
        name: "dup",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "snippetNameTaken" })

    mocks.isUniqueViolationError.mockReturnValue(true)
    mocks.update.mockRejectedValue(new Error("duplicate key"))
    await expect(
      socialPostSnippetService.update({
        id: "1",
        name: "dup",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "snippetNameTaken" })
  })

  test("update and delete answer not found for another workspace's id", async () => {
    mocks.update.mockResolvedValue(null)
    mocks.delete.mockResolvedValue(false)

    await expect(
      socialPostSnippetService.update({ id: "9", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
    await expect(
      socialPostSnippetService.delete({ id: "9", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("lists with the workspace cap", async () => {
    mocks.list.mockResolvedValue([])

    await socialPostSnippetService.list({
      kind: "hashtags",
      workspaceId: "ws-1",
    })

    expect(mocks.list).toHaveBeenCalledWith({
      kind: "hashtags",
      limit: MAX_POST_SNIPPETS_PER_WORKSPACE,
      workspaceId: "ws-1",
    })
  })
})

describe("signature append", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("appends the signature once after a blank line", async () => {
    mocks.findById.mockResolvedValue(snippet)

    const signed = await socialPostSnippetService.appendSignature({
      maxLength: 5000,
      signatureId: "1",
      text: "Sale today  ",
      workspaceId: "ws-1",
    })

    expect(signed).toBe("Sale today\n\n— The Acme team")
    expect(signed.match(/The Acme team/g)).toHaveLength(1)
  })

  test("a post with no text becomes the signature alone", () => {
    expect(composeSignedText(null, "sig")).toBe("sig")
    expect(composeSignedText("   ", "sig")).toBe("sig")
  })

  test("refuses a snippet that is not a signature or not in the workspace", async () => {
    mocks.findById.mockResolvedValueOnce({ ...snippet, kind: "hashtags" })
    await expect(
      socialPostSnippetService.appendSignature({
        maxLength: 5000,
        signatureId: "1",
        text: "x",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "signatureId" })

    mocks.findById.mockResolvedValueOnce(null)
    await expect(
      socialPostSnippetService.appendSignature({
        maxLength: 5000,
        signatureId: "2",
        text: "x",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "signatureId" })
  })

  test("refuses text that would pass the limit with the signature", async () => {
    mocks.findById.mockResolvedValue(snippet)

    await expect(
      socialPostSnippetService.appendSignature({
        maxLength: 20,
        signatureId: "1",
        text: "A long text that is already close to it",
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ field: "text" })
  })
})
