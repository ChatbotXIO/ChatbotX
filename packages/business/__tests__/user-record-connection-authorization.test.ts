import { userRepository } from "@chatbotx.io/database/repositories"
import { encryptUtils } from "@chatbotx.io/encryption"
import { DrizzleQueryError } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { logger } from "../src/logger"
import {
  type RecordConnectionAuthorizationInput,
  userService,
} from "../src/user/service"

const SECRET = "super-secret-access-token"

const baseInput: RecordConnectionAuthorizationInput = {
  userId: "user-1",
  provider: "messenger",
  auth: {
    authType: "oauth2",
    clientId: "client",
    clientSecret: "client-secret",
    redirectUrl: "https://example.test/callback",
    tokens: { accessToken: SECRET },
  },
  phase: "candidateListingSucceeded",
  workspaceId: "workspace-1",
  purpose: "connect",
  connectSessionId: "session-1",
  candidateCount: 3,
  unavailableCandidateCount: 1,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-18T10:00:00.000Z"))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("userService.recordConnectionAuthorization", () => {
  test("encrypts the auth with the user and provider AAD and stores it", async () => {
    const record = vi
      .spyOn(userRepository, "recordConnectionAuthorization")
      .mockResolvedValue(true)
    const encrypted = { v: 1, iv: "i", text: "t", tag: "g" }
    const encrypt = vi
      .spyOn(encryptUtils, "encryptObject")
      .mockResolvedValue(encrypted as never)

    await userService.recordConnectionAuthorization(baseInput)

    expect(encrypt).toHaveBeenCalledWith(
      baseInput.auth,
      "user:user-1:connection-authorization:messenger",
    )
    expect(record).toHaveBeenCalledWith({
      userId: "user-1",
      provider: "messenger",
      entry: {
        encryptedAuth: encrypted,
        phase: "candidateListingSucceeded",
        purpose: "connect",
        workspaceId: "workspace-1",
        connectSessionId: "session-1",
        candidateCount: 3,
        unavailableCandidateCount: 1,
        connectSessionErrorCode: null,
        capturedAt: "2026-11-18T10:00:00.000Z",
      },
    })
  })

  test("defaults the optional metadata to null", async () => {
    const record = vi
      .spyOn(userRepository, "recordConnectionAuthorization")
      .mockResolvedValue(true)

    await userService.recordConnectionAuthorization({
      userId: "user-1",
      provider: "telegram",
      auth: baseInput.auth,
      phase: "credentialsValidated",
      workspaceId: "workspace-1",
    })

    expect(record.mock.calls[0]?.[0].entry).toMatchObject({
      purpose: null,
      connectSessionId: null,
      candidateCount: null,
      unavailableCandidateCount: null,
      connectSessionErrorCode: null,
    })
  })

  test.each([
    null,
    undefined,
  ])("skips a %s actor without writing", async (userId) => {
    const record = vi.spyOn(userRepository, "recordConnectionAuthorization")
    const encrypt = vi.spyOn(encryptUtils, "encryptObject")
    const debug = vi.spyOn(logger, "debug").mockImplementation(() => undefined)

    await expect(
      userService.recordConnectionAuthorization({ ...baseInput, userId }),
    ).resolves.toBeUndefined()

    expect(record).not.toHaveBeenCalled()
    expect(encrypt).not.toHaveBeenCalled()
    expect(debug).toHaveBeenCalled()
  })

  test("swallows repository errors and never logs the plaintext", async () => {
    vi.spyOn(userRepository, "recordConnectionAuthorization").mockRejectedValue(
      new Error("db down"),
    )
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)

    await expect(
      userService.recordConnectionAuthorization(baseInput),
    ).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        userId: "user-1",
        provider: "messenger",
      }),
      expect.any(String),
    )
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET)
  })

  test("logs a database error without its bound parameters", async () => {
    const params = ["user-1", JSON.stringify({ encryptedAuth: "ciphertext" })]
    vi.spyOn(userRepository, "recordConnectionAuthorization").mockRejectedValue(
      new DrizzleQueryError(
        "update user set connection_authorizations = $1",
        params,
        Object.assign(new Error("boom"), { code: "57014" }),
      ),
    )
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)

    await userService.recordConnectionAuthorization(baseInput)

    const loggedErr = (warn.mock.calls[0]?.[0] as { err: Error }).err
    expect(loggedErr).not.toBeInstanceOf(DrizzleQueryError)
    expect(loggedErr.message).toBe("Database error (57014)")
    expect(JSON.stringify(warn.mock.calls)).not.toContain("encryptedAuth")
    expect(JSON.stringify(warn.mock.calls)).not.toContain("ciphertext")
  })

  test("swallows encryption errors", async () => {
    vi.spyOn(encryptUtils, "encryptObject").mockRejectedValue(new Error("kms"))
    const record = vi.spyOn(userRepository, "recordConnectionAuthorization")
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)

    await expect(
      userService.recordConnectionAuthorization(baseInput),
    ).resolves.toBeUndefined()

    expect(record).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  test("rejects an invalid provider without throwing or writing", async () => {
    const record = vi.spyOn(userRepository, "recordConnectionAuthorization")
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)

    await expect(
      userService.recordConnectionAuthorization({
        ...baseInput,
        provider: "not-a-provider" as never,
      }),
    ).resolves.toBeUndefined()

    expect(record).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })
})

describe("userService.findById", () => {
  test("reads the user through the projection that drops the secret column", async () => {
    const user = { id: "user-1", email: "a@example.test" }
    const find = vi
      .spyOn(userRepository, "findById")
      .mockResolvedValue(user as never)

    const result = await userService.findById("user-1")

    expect(find).toHaveBeenCalledWith("user-1")
    expect(result).not.toHaveProperty("connectionAuthorizations")
  })
})
