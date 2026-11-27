import { DrizzleQueryError } from "drizzle-orm"
import { afterEach, describe, expect, test, vi } from "vitest"
import { rotateConnectionAuthorizations } from "../scripts/rotate-connection-authorizations"
import { userRepository } from "../src/repositories/user/repository"

const OLD_CIPHERTEXT = "old-ciphertext-bytes"
const NEW_CIPHERTEXT = "new-ciphertext-bytes"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("rotateConnectionAuthorizations logging", () => {
  test("a failing replace UPDATE logs no ciphertext", async () => {
    const entry = {
      encryptedAuth: {
        v: 1,
        kid: "old",
        iv: "i",
        text: OLD_CIPHERTEXT,
        tag: "t",
      },
    }
    vi.spyOn(
      userRepository,
      "listConnectionAuthorizationsAfter",
    ).mockResolvedValue([
      { id: "user-1", connectionAuthorizations: { messenger: entry } },
    ] as never)
    vi.spyOn(
      userRepository,
      "replaceConnectionAuthorizationCiphertext",
    ).mockRejectedValue(
      new DrizzleQueryError(
        "update user set connection_authorizations = $1",
        [OLD_CIPHERTEXT, NEW_CIPHERTEXT],
        Object.assign(new Error("boom"), { code: "57014" }),
      ),
    )
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const result = await rotateConnectionAuthorizations({
      activeKid: "new",
      dryRun: false,
      crypto: {
        decrypt: async () => ({ secret: "plain" }),
        encrypt: async () =>
          ({
            v: 1,
            kid: "new",
            iv: "i",
            text: NEW_CIPHERTEXT,
            tag: "t",
          }) as never,
      },
    })

    expect(result.errors).toBe(1)
    const logged = JSON.stringify(
      error.mock.calls.map((call) =>
        call.map((arg) => (arg instanceof Error ? arg.message : arg)),
      ),
    )
    expect(logged).toContain("57014")
    expect(logged).not.toContain(OLD_CIPHERTEXT)
    expect(logged).not.toContain(NEW_CIPHERTEXT)
    expect(
      error.mock.calls.flat().some((a) => a instanceof DrizzleQueryError),
    ).toBe(false)
  })
})
