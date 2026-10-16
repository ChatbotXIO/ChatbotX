import { describe, expect, test } from "vitest"
import {
  type CapiConnectionRow,
  resolveCapiConnection,
} from "../src/meta-conversions/connection-state"

const baseRow: CapiConnectionRow = {
  capiDisconnectedAt: null,
  hasCapiAccessToken: false,
  datasetId: null,
  hasCapiScope: false,
}

describe("resolveCapiConnection", () => {
  test("is not connected for a row that never connected", () => {
    expect(resolveCapiConnection("messenger", baseRow)).toBe("notConnected")
    expect(resolveCapiConnection("instagram", baseRow)).toBe("notConnected")
    expect(resolveCapiConnection("whatsapp", baseRow)).toBe("notConnected")
  })

  test("is connected with a dedicated token and a dataset, on every channel", () => {
    const row = {
      ...baseRow,
      hasCapiAccessToken: true,
      datasetId: "ds-1",
    }

    expect(resolveCapiConnection("messenger", row)).toBe("connected")
    expect(resolveCapiConnection("instagram", row)).toBe("connected")
    expect(resolveCapiConnection("whatsapp", row)).toBe("connected")
  })

  test("is not connected with a dedicated token but no dataset", () => {
    const row = { ...baseRow, hasCapiAccessToken: true }

    expect(resolveCapiConnection("messenger", row)).toBe("notConnected")
  })

  test("keeps a legacy messenger/instagram row connected on its stored scope flag", () => {
    const row = { ...baseRow, datasetId: "ds-1", hasCapiScope: true }

    expect(resolveCapiConnection("messenger", row)).toBe("connected")
    expect(resolveCapiConnection("instagram", row)).toBe("connected")
  })

  test("asks a legacy messenger/instagram row whose scope lapsed to reconnect, keeping its dataset", () => {
    const row = { ...baseRow, datasetId: "ds-1", hasCapiScope: false }

    expect(resolveCapiConnection("messenger", row)).toBe("reconnect")
    expect(resolveCapiConnection("instagram", row)).toBe("reconnect")
  })

  test("a row without a dataset is never a reconnect: there is nothing to keep", () => {
    const row = { ...baseRow, datasetId: null, hasCapiScope: false }

    expect(resolveCapiConnection("messenger", row)).toBe("notConnected")
  })

  test("keeps a legacy whatsapp row with a dataset connected: the channel is exempt from the scope", () => {
    const row = { ...baseRow, datasetId: "ds-1", hasCapiScope: false }

    expect(resolveCapiConnection("whatsapp", row)).toBe("connected")
  })

  test("a user disconnect wins over a token, a dataset and the scope", () => {
    const row = {
      capiDisconnectedAt: new Date("2026-10-01T00:00:00.000Z"),
      hasCapiAccessToken: true,
      datasetId: "ds-1",
      hasCapiScope: true,
    }

    expect(resolveCapiConnection("messenger", row)).toBe("notConnected")
    expect(resolveCapiConnection("whatsapp", row)).toBe("notConnected")
  })
})
