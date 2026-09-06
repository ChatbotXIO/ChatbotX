import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/partials", async () => {
  const { z } = await import("zod")
  return {
    aiAgentModelConfig: z.object({
      integrationId: z.string().optional(),
      kind: z.string().optional(),
      model: z.string().optional(),
      provider: z.string().optional(),
    }),
  }
})

vi.mock("@chatbotx.io/flow-config", async () => {
  const { z } = await import("zod")
  const stepSchema = z.object({ stepType: z.string() }).passthrough()
  return {
    aiEditImageSchema: stepSchema,
    aiGenerateImageSchema: stepSchema,
    aiSpeechToTextSchema: stepSchema,
    aiTextToSpeechSchema: stepSchema,
    metadataSchema: z.record(z.string(), z.unknown()),
  }
})

// isNoRedisEnv() reads process.env directly (no module-scope caching), but
// the queue barrels cache their exported queue at import time, so the module
// registry must still be reset between cases that import a queue.
const DEAD_REDIS_URL = "redis://127.0.0.1:6399"

describe("isNoRedisEnv", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("REDIS_URL", DEAD_REDIS_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("is true under vitest with NEXT_PHASE unset", async () => {
    vi.stubEnv("NEXT_PHASE", "")
    vi.stubEnv("VITEST", "true")

    const { isNoRedisEnv } = await import("../src/lib/connection")

    expect(isNoRedisEnv()).toBe(true)
  })

  test("is true when NEXT_PHASE is phase-production-build", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build")
    vi.stubEnv("VITEST", "")

    const { isNoRedisEnv } = await import("../src/lib/connection")

    expect(isNoRedisEnv()).toBe(true)
  })

  test("is false when neither condition holds", async () => {
    vi.stubEnv("NEXT_PHASE", "")
    vi.stubEnv("VITEST", "")

    const { isNoRedisEnv } = await import("../src/lib/connection")

    expect(isNoRedisEnv()).toBe(false)
  })

  test("importing a queue barrel under vitest yields the fake queue, not a BullMQ Queue", async () => {
    vi.stubEnv("VITEST", "true")

    const { aiAgentQueue } = await import("../src/queues/ai-agent")

    expect(typeof aiAgentQueue.add).toBe("function")
    expect(aiAgentQueue).not.toHaveProperty("opts")
  })

  test("importing the heavy queue barrel under vitest yields the fake queue, not a BullMQ Queue", async () => {
    vi.stubEnv("VITEST", "true")

    const { heavyQueue } = await import("../src/queues/heavy")

    expect(typeof heavyQueue.add).toBe("function")
    expect(heavyQueue).not.toHaveProperty("opts")
  })

  test("does not dial Redis for the heavy queue when NEXT_PHASE is phase-production-build", async () => {
    vi.stubEnv("VITEST", "")
    vi.stubEnv("NEXT_PHASE", "phase-production-build")

    const { heavyQueue } = await import("../src/queues/heavy")

    expect(typeof heavyQueue.add).toBe("function")
    expect(heavyQueue).not.toHaveProperty("opts")
  })
})
