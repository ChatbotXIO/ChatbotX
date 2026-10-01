import type { ImportErrorSample } from "@chatbotx.io/database/schema"
import { describe, expect, test, vi } from "vitest"
import { getImportErrorSampleDescription } from "./import-error-sample"

const unsupportedBlockError = {
  reason: "unsupportedBlock",
  capability: {
    code: "unsupportedBlock",
    channel: "whatsapp",
    block: "sendCarousel",
  },
} as ImportErrorSample

const constraintExceededError = {
  reason: "constraintExceeded",
  capability: {
    actual: 4,
    allowed: 3,
    block: "sendText",
    channel: "tiktok",
    code: "constraintExceeded",
    policyVersion: 1,
    unit: "buttons",
  },
} as ImportErrorSample

const incompleteConstraintExceededError = {
  reason: "constraintExceeded",
  capability: {
    block: "sendText",
    channel: "tiktok",
    code: "constraintExceeded",
    policyVersion: 1,
  },
} as ImportErrorSample

describe("getImportErrorSampleDescription", () => {
  test("localizes channel capability errors with their structured values", () => {
    const t = vi.fn(
      (key: string, values: Record<string, string | number | undefined>) =>
        `${key}:${JSON.stringify(values)}`,
    )

    const description = getImportErrorSampleDescription(
      unsupportedBlockError,
      t,
    )

    expect(description).toBe(
      'fields.import.histories.unsupportedChannelStep:{"block":"sendCarousel","channel":"whatsapp"}',
    )
  })

  test("localizes complete channel constraint errors with their numeric values", () => {
    const t = vi.fn(
      (key: string, values: Record<string, string | number | undefined>) =>
        `${key}:${JSON.stringify(values)}`,
    )

    const description = getImportErrorSampleDescription(
      constraintExceededError,
      t,
    )

    expect(description).toBe(
      'fields.import.histories.channelStepConstraintExceeded:{"actual":4,"allowed":3,"block":"sendText","channel":"tiktok","unit":"buttons"}',
    )
  })

  test("localizes incomplete channel constraint errors without English fallbacks", () => {
    const t = vi.fn(
      (key: string, values: Record<string, string | number | undefined>) =>
        `${key}:${JSON.stringify(values)}`,
    )

    const description = getImportErrorSampleDescription(
      incompleteConstraintExceededError,
      t,
    )

    expect(description).toBe(
      'fields.import.histories.channelStepConstraintExceededGeneric:{"block":"sendText","channel":"tiktok"}',
    )
  })
})
