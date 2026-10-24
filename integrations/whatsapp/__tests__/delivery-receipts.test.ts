import { describe, expect, test } from "vitest"
import { integration } from "../src/integration"

describe("whatsapp integration", () => {
  test("declares delivery receipts so Last Delivered waits for the real receipt", () => {
    expect(integration.deliveryReceipts).toBe(true)
  })
})
