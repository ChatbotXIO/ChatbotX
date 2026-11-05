// @vitest-environment node

import type { TemplateExport } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { inSourceOrder } from "../src/template/source-order"

const payload = (over: object) => over as unknown as TemplateExport

describe("inSourceOrder", () => {
  test("puts resources and manifests oldest first, comparing ids as numbers", () => {
    const sorted = inSourceOrder(
      payload({
        resources: {
          flows: [
            { sourceId: "11769709402018132" },
            { sourceId: "9007199254740993" },
            { sourceId: "9007199254740992" },
          ],
        },
        manifests: {
          tags: {
            "11769709402018132": { name: "new" },
            "9007199254740992": { name: "old" },
          },
        },
      }),
    )

    expect(sorted.resources.flows.map((entry) => entry.sourceId)).toEqual([
      "9007199254740992",
      "9007199254740993",
      "11769709402018132",
    ])
    expect(Object.values(sorted.manifests.tags)).toEqual([
      { name: "old" },
      { name: "new" },
    ])
  })

  test("sorts the arrays settings holds, each on its own", () => {
    const sorted = inSourceOrder(
      payload({
        resources: {
          settings: {
            botFields: [{ sourceId: "20" }, { sourceId: "10" }],
            savedReplies: [{ sourceId: "2" }, { sourceId: "1" }],
          },
        },
        manifests: {},
      }),
    )

    expect(sorted.resources.settings).toEqual({
      botFields: [{ sourceId: "10" }, { sourceId: "20" }],
      savedReplies: [{ sourceId: "1" }, { sourceId: "2" }],
    })
  })

  test("leaves ids it cannot compare where they are, and the input untouched", () => {
    const flows = [{ sourceId: "b" }, { sourceId: "a" }]

    const sorted = inSourceOrder(
      payload({ resources: { flows }, manifests: {} }),
    )

    expect(sorted.resources.flows).toEqual(flows)
    expect(sorted.resources.flows).not.toBe(flows)
  })
})
