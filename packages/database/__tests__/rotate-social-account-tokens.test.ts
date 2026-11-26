import type { EncryptedData } from "@chatbotx.io/encryption"
import { describe, expect, test, vi } from "vitest"
import { rotateSocialAccountTokens } from "../scripts/rotate-social-account-tokens"

const blob = (kid: string, label = kid) =>
  ({ kid, label }) as unknown as EncryptedData

const crypto = () => ({
  decrypt: vi.fn(async (value: EncryptedData) => ({
    from: (value as unknown as { label: string }).label,
  })),
  encrypt: vi.fn(async (value: unknown) => blob("new", JSON.stringify(value))),
})

type AccountRow = {
  accessToken: EncryptedData | null
  id: string
  refreshToken: EncryptedData | null
  workspaceId: string
}
type DestinationRow = {
  accessToken: EncryptedData | null
  id: string
  workspaceId: string
}

const repository = (
  accounts: AccountRow[],
  destinations: DestinationRow[] = [],
) => {
  const page = <Row extends { id: string }>(rows: Row[]) =>
    vi.fn(
      async ({ afterId, limit }: { afterId: string | null; limit: number }) =>
        rows
          .filter((row) => afterId === null || row.id > afterId)
          .slice(0, limit),
    )
  return {
    listDestinationTokenRowsAfter: page(destinations),
    listTokenRowsAfter: page(accounts),
    replaceAccountTokenCiphertext: vi.fn(async () => true),
    replaceDestinationTokenCiphertext: vi.fn(async () => true),
  }
}

describe("rotateSocialAccountTokens", () => {
  test("re-encrypts a stale token with the AAD of its own row", async () => {
    const repo = repository([
      {
        accessToken: blob("old"),
        id: "1",
        refreshToken: null,
        workspaceId: "ws-1",
      },
    ])
    const crypt = crypto()

    const result = await rotateSocialAccountTokens({
      activeKid: "new",
      crypto: crypt,
      dryRun: false,
      repository: repo,
    })

    expect(crypt.decrypt).toHaveBeenCalledWith(
      expect.anything(),
      "social-account:ws-1:1",
    )
    expect(crypt.encrypt).toHaveBeenCalledWith(
      expect.anything(),
      "social-account:ws-1:1",
    )
    expect(result).toMatchObject({ errors: 0, rotated: 1, toRotate: 1 })
  })

  test("the replacement is conditional on the ciphertexts that were read", async () => {
    const accessToken = blob("old")
    const refreshToken = blob("old", "r")
    const repo = repository([
      { accessToken, id: "1", refreshToken, workspaceId: "ws-1" },
    ])

    await rotateSocialAccountTokens({
      activeKid: "new",
      crypto: crypto(),
      dryRun: false,
      repository: repo,
    })

    expect(repo.replaceAccountTokenCiphertext).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedAccessToken: accessToken,
        expectedRefreshToken: refreshToken,
        id: "1",
      }),
    )
  })

  test("a token already under the active key is skipped", async () => {
    const repo = repository([
      {
        accessToken: blob("new"),
        id: "1",
        refreshToken: null,
        workspaceId: "ws-1",
      },
    ])

    const result = await rotateSocialAccountTokens({
      activeKid: "new",
      crypto: crypto(),
      dryRun: false,
      repository: repo,
    })

    expect(repo.replaceAccountTokenCiphertext).not.toHaveBeenCalled()
    expect(result).toMatchObject({ rotated: 0, scanned: 1, toRotate: 0 })
  })

  test("a disconnected account holds no token and is skipped", async () => {
    const repo = repository([
      { accessToken: null, id: "1", refreshToken: null, workspaceId: "ws-1" },
    ])

    const result = await rotateSocialAccountTokens({
      activeKid: "new",
      crypto: crypto(),
      dryRun: false,
      repository: repo,
    })

    expect(result.toRotate).toBe(0)
  })

  test("a dry run counts what it would rotate and writes nothing", async () => {
    const repo = repository(
      [
        {
          accessToken: blob("old"),
          id: "1",
          refreshToken: null,
          workspaceId: "ws-1",
        },
      ],
      [{ accessToken: blob("old"), id: "9", workspaceId: "ws-1" }],
    )
    const crypt = crypto()

    const result = await rotateSocialAccountTokens({
      activeKid: "new",
      crypto: crypt,
      dryRun: true,
      repository: repo,
    })

    expect(result.toRotate).toBe(2)
    expect(crypt.encrypt).not.toHaveBeenCalled()
    expect(repo.replaceAccountTokenCiphertext).not.toHaveBeenCalled()
    expect(repo.replaceDestinationTokenCiphertext).not.toHaveBeenCalled()
  })

  test("destination tokens are rotated with the destination AAD", async () => {
    const repo = repository(
      [],
      [{ accessToken: blob("old"), id: "9", workspaceId: "ws-1" }],
    )
    const crypt = crypto()

    const result = await rotateSocialAccountTokens({
      activeKid: "new",
      crypto: crypt,
      dryRun: false,
      repository: repo,
    })

    expect(crypt.encrypt).toHaveBeenCalledWith(
      expect.anything(),
      "social-account-destination:ws-1:9",
    )
    expect(result.rotated).toBe(1)
  })

  test("a row changed meanwhile is counted, not overwritten", async () => {
    const repo = repository([
      {
        accessToken: blob("old"),
        id: "1",
        refreshToken: null,
        workspaceId: "ws-1",
      },
    ])
    repo.replaceAccountTokenCiphertext.mockResolvedValue(false)

    const result = await rotateSocialAccountTokens({
      activeKid: "new",
      crypto: crypto(),
      dryRun: false,
      repository: repo,
    })

    expect(result).toMatchObject({ rotated: 0, skippedChanged: 1 })
  })

  test("one failing row is counted and the rest still rotate", async () => {
    const repo = repository([
      {
        accessToken: blob("old", "bad"),
        id: "1",
        refreshToken: null,
        workspaceId: "ws-1",
      },
      {
        accessToken: blob("old"),
        id: "2",
        refreshToken: null,
        workspaceId: "ws-1",
      },
    ])
    const crypt = crypto()
    crypt.decrypt.mockRejectedValueOnce(new Error("corrupt"))
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)

    const result = await rotateSocialAccountTokens({
      activeKid: "new",
      crypto: crypt,
      dryRun: false,
      repository: repo,
    })

    expect(result).toMatchObject({ errors: 1, rotated: 1 })
    errorSpy.mockRestore()
  })

  test("pages through more rows than one batch", async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      accessToken: blob("old"),
      id: String(index + 1),
      refreshToken: null,
      workspaceId: "ws-1",
    }))
    const repo = repository(rows)

    const result = await rotateSocialAccountTokens({
      activeKid: "new",
      batchSize: 2,
      crypto: crypto(),
      dryRun: false,
      repository: repo,
    })

    expect(result.rotated).toBe(5)
    expect(repo.listTokenRowsAfter.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})
