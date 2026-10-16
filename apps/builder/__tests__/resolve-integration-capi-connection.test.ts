import { describe, expect, test } from "vitest"
import { resolveIntegrationCapiConnection } from "@/features/meta-conversions/lib/resolve-integration-capi-connection"

const encryptedToken = { v: 1 as const, iv: "iv", text: "text", tag: "tag" }

const row = {
  capiDisconnectedAt: null,
  capiAccessToken: null,
  datasetId: null,
  hasCapiScope: false,
}

describe("resolveIntegrationCapiConnection", () => {
  test("derives token presence from the stored ciphertext without exposing it", () => {
    expect(
      resolveIntegrationCapiConnection("messenger", {
        ...row,
        capiAccessToken: encryptedToken,
        datasetId: "ds-1",
      }),
    ).toBe("connected")
  })

  test("a row with a dataset but neither token nor scope must reconnect on a scope-gated channel", () => {
    expect(
      resolveIntegrationCapiConnection("instagram", {
        ...row,
        datasetId: "ds-1",
      }),
    ).toBe("reconnect")
  })

  test("a legacy WhatsApp row with only a dataset stays connected", () => {
    expect(
      resolveIntegrationCapiConnection("whatsapp", {
        ...row,
        datasetId: "ds-1",
      }),
    ).toBe("connected")
  })

  test("a user disconnect wins", () => {
    expect(
      resolveIntegrationCapiConnection("messenger", {
        capiDisconnectedAt: new Date("2026-10-01T00:00:00.000Z"),
        capiAccessToken: encryptedToken,
        datasetId: "ds-1",
        hasCapiScope: true,
      }),
    ).toBe("notConnected")
  })
})
