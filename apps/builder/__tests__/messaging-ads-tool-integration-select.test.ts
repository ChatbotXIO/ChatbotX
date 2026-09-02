import { describe, expect, test } from "vitest"
import { selectMessagingAdsToolIntegration } from "@/features/ads-campaign/lib/select-tool-integration"
import type { MessagingAdsToolIntegration } from "@/features/ads-campaign/queries/tool-integrations"

const integration = (id: string, name = id): MessagingAdsToolIntegration => ({
  id,
  name,
})

describe("selectMessagingAdsToolIntegration", () => {
  test("returns the requested integration when its id is in the list", () => {
    const integrations = [integration("a"), integration("b"), integration("c")]

    const result = selectMessagingAdsToolIntegration({
      integrations,
      requestedId: "b",
      activeIntegrationIds: [],
    })

    expect(result).toEqual(integration("b"))
  })

  test("falls through to the next strategy when the requested id is unknown", () => {
    const integrations = [integration("a"), integration("b")]

    const result = selectMessagingAdsToolIntegration({
      integrations,
      requestedId: "unknown",
      activeIntegrationIds: ["b"],
    })

    expect(result).toEqual(integration("b"))
  })

  test("prefers the first active integration when requestedId is empty", () => {
    const integrations = [integration("a"), integration("b"), integration("c")]

    const result = selectMessagingAdsToolIntegration({
      integrations,
      requestedId: "",
      activeIntegrationIds: ["c"],
    })

    expect(result).toEqual(integration("c"))
  })

  test("when multiple integrations are active, prefers the one first in list order (not active-list order)", () => {
    const integrations = [integration("a"), integration("b"), integration("c")]

    const result = selectMessagingAdsToolIntegration({
      integrations,
      requestedId: "",
      // Active-list order names "c" first, but list order should win.
      activeIntegrationIds: ["c", "b"],
    })

    expect(result).toEqual(integration("b"))
  })

  test("falls back to the first integration when none are active", () => {
    const integrations = [integration("a"), integration("b")]

    const result = selectMessagingAdsToolIntegration({
      integrations,
      requestedId: "",
      activeIntegrationIds: [],
    })

    expect(result).toEqual(integration("a"))
  })

  test("returns null when the integrations list is empty", () => {
    const result = selectMessagingAdsToolIntegration({
      integrations: [],
      requestedId: "",
      activeIntegrationIds: [],
    })

    expect(result).toBeNull()
  })

  test("returns the requested integration when it is also active", () => {
    const integrations = [integration("a"), integration("b")]

    const result = selectMessagingAdsToolIntegration({
      integrations,
      requestedId: "b",
      activeIntegrationIds: ["b"],
    })

    expect(result).toEqual(integration("b"))
  })

  test("falls back past an active-id belonging to another channel (absent from this list)", () => {
    const integrations = [integration("a"), integration("b")]

    const result = selectMessagingAdsToolIntegration({
      integrations,
      requestedId: "",
      // "z" is active on this workspace but for a different channel/list.
      activeIntegrationIds: ["z"],
    })

    expect(result).toEqual(integration("a"))
  })
})
