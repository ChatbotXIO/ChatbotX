import { beforeEach, describe, expect, test, vi } from "vitest"

const findWithRelationsSpy = vi.fn()
const claimSpy = vi.fn()
const { loggerErrorSpy } = vi.hoisted(() => ({
  loggerErrorSpy: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  sequenceDispatchRepository: {
    findWithRelations: (...args: unknown[]) => findWithRelationsSpy(...args),
    claim: (...args: unknown[]) => claimSpy(...args),
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: loggerErrorSpy,
  },
}))

import { DispatchProcessorService } from "../src/sequence-scheduler/services/dispatch-processor.service"

// ---------- shared fixtures ----------

function makeDispatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    workspaceId: "ws1",
    status: "pending",
    runAtMs: Date.now() - 5000,
    sequence: {},
    contact: {},
    enrollment: {},
    ...overrides,
  } as unknown as Parameters<DispatchProcessorService["validateDispatch"]>[0]
}

beforeEach(() => {
  vi.restoreAllMocks()
  loggerErrorSpy.mockReset()
  findWithRelationsSpy.mockReset()
  claimSpy.mockReset()
  findWithRelationsSpy.mockResolvedValue(null)
  claimSpy.mockResolvedValue(false)
})

// ---------- tests ----------

describe("DispatchProcessorService", () => {
  describe("fetchDispatch", () => {
    test("returns the dispatch when the repository finds a record", async () => {
      // Arrange
      const dispatch = makeDispatch()
      findWithRelationsSpy.mockResolvedValue(dispatch)

      // Act
      const result = await new DispatchProcessorService().fetchDispatch(
        "d1",
        "pending",
        "ws1",
      )

      // Assert
      expect(result).toEqual(dispatch)
    })

    test("returns null when the repository returns null (not found)", async () => {
      // Arrange
      findWithRelationsSpy.mockResolvedValue(null)

      // Act
      const result = await new DispatchProcessorService().fetchDispatch(
        "missing",
        "pending",
        "ws1",
      )

      // Assert
      expect(result).toBeNull()
    })

    test("returns null and logs error when the repository throws", async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, "error")
      findWithRelationsSpy.mockRejectedValue(new Error("connection refused"))

      // Act
      const result = await new DispatchProcessorService().fetchDispatch(
        "d1",
        "pending",
        "ws1",
      )

      // Assert
      expect(result).toBeNull()
      expect(consoleSpy).not.toHaveBeenCalled()
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.any(Error),
        "Error fetchDispatch query failed",
      )
    })

    test("queries with id + status + workspaceId", async () => {
      // Arrange
      findWithRelationsSpy.mockResolvedValue({ id: "d99" })

      // Act
      await new DispatchProcessorService().fetchDispatch(
        "d99",
        "pending",
        "ws1",
      )

      // Assert
      expect(findWithRelationsSpy).toHaveBeenCalledWith({
        id: "d99",
        status: "pending",
        workspaceId: "ws1",
      })
    })
  })

  describe("validateDispatch", () => {
    test("returns false when status is running", () => {
      // Arrange
      const dispatch = makeDispatch({ status: "running" })

      // Act + Assert
      expect(new DispatchProcessorService().validateDispatch(dispatch)).toBe(
        false,
      )
    })

    test("returns false when status is failed", () => {
      // Arrange
      const dispatch = makeDispatch({ status: "failed" })

      // Act + Assert
      expect(new DispatchProcessorService().validateDispatch(dispatch)).toBe(
        false,
      )
    })

    test("returns false when status is completed", () => {
      // Arrange
      const dispatch = makeDispatch({ status: "completed" })

      // Act + Assert
      expect(new DispatchProcessorService().validateDispatch(dispatch)).toBe(
        false,
      )
    })

    test("returns true when dispatch is pending", () => {
      // Arrange
      const dispatch = makeDispatch({ status: "pending" })

      // Act + Assert
      expect(new DispatchProcessorService().validateDispatch(dispatch)).toBe(
        true,
      )
    })

    test("returns false when dispatch is null", () => {
      expect(new DispatchProcessorService().validateDispatch(null)).toBe(false)
    })
  })

  describe("isDispatchReady", () => {
    test("returns true when runAtMs is in the past", () => {
      // Arrange
      const dispatch = makeDispatch({ runAtMs: Date.now() - 10_000 })

      // Act + Assert
      expect(
        new DispatchProcessorService().isDispatchReady(
          dispatch as NonNullable<typeof dispatch>,
        ),
      ).toBe(true)
    })

    test("returns true when runAtMs is within the 1 second tolerance window", () => {
      // Arrange
      const dispatch = makeDispatch({ runAtMs: Date.now() + 800 })

      // Act + Assert
      expect(
        new DispatchProcessorService().isDispatchReady(
          dispatch as NonNullable<typeof dispatch>,
        ),
      ).toBe(true)
    })

    test("returns false when runAtMs is beyond the tolerance window", () => {
      // Arrange
      const dispatch = makeDispatch({ runAtMs: Date.now() + 60_000 })

      // Act + Assert
      expect(
        new DispatchProcessorService().isDispatchReady(
          dispatch as NonNullable<typeof dispatch>,
        ),
      ).toBe(false)
    })
  })

  describe("lockDispatch", () => {
    test("returns true when the repository acquires the lock", async () => {
      // Arrange
      claimSpy.mockResolvedValue(true)
      const dispatch = makeDispatch() as NonNullable<typeof makeDispatch>

      // Act
      const result = await new DispatchProcessorService().lockDispatch(
        dispatch as NonNullable<typeof dispatch>,
      )

      // Assert
      expect(result).toBe(true)
    })

    test("returns false when the repository fails to acquire the lock", async () => {
      // Arrange
      claimSpy.mockResolvedValue(false)
      const dispatch = makeDispatch() as NonNullable<typeof makeDispatch>

      // Act
      const result = await new DispatchProcessorService().lockDispatch(
        dispatch as NonNullable<typeof dispatch>,
      )

      // Assert
      expect(result).toBe(false)
    })

    test("delegates to the repository with id, workspaceId, and a lock owner", async () => {
      // Arrange
      claimSpy.mockResolvedValue(true)
      const dispatch = makeDispatch() as NonNullable<typeof makeDispatch>

      // Act
      await new DispatchProcessorService().lockDispatch(
        dispatch as NonNullable<typeof dispatch>,
      )

      // Assert
      expect(claimSpy).toHaveBeenCalledWith({
        id: "d1",
        workspaceId: "ws1",
        lockOwner: expect.any(String),
      })
    })
  })
})
