// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  describeVersionChanges,
  mergeVersionChanges,
} from "../src/template/version-changes"

const payload = (over: {
  flows?: unknown[]
  tags?: Record<string, { name: string }>
  botFields?: unknown[]
}) =>
  ({
    resources: {
      flows: over.flows ?? [],
      settings: { savedReplies: [], botFields: over.botFields ?? [] },
    },
    manifests: {
      tags: over.tags ?? {},
      customFields: {},
      productCategories: {},
    },
  }) as never

describe("describeVersionChanges", () => {
  test("names what was added, changed and removed, per category", () => {
    const before = payload({
      flows: [
        { sourceId: "1", name: "Welcome", nodes: ["a"] },
        { sourceId: "2", name: "Old" },
      ],
      tags: { "7": { name: "VIP" } },
    })
    const after = payload({
      flows: [
        { sourceId: "1", name: "Welcome", nodes: ["b"] },
        { sourceId: "3", name: "New" },
      ],
      tags: { "8": { name: "Lead" } },
    })

    expect(describeVersionChanges(before, after)).toEqual(
      expect.arrayContaining([
        {
          category: "flows",
          added: ["New"],
          changed: ["Welcome"],
          removed: ["Old"],
        },
        { category: "tags", added: ["Lead"], changed: [], removed: ["VIP"] },
      ]),
    )
  })

  test("lists nothing for categories that did not change", () => {
    const same = payload({ flows: [{ sourceId: "1", name: "Welcome" }] })

    expect(describeVersionChanges(same, same)).toEqual([])
  })

  test("the order of an entry's keys is no change", () => {
    expect(
      describeVersionChanges(
        payload({ flows: [{ sourceId: "1", name: "A", nodes: [] }] }),
        payload({ flows: [{ nodes: [], name: "A", sourceId: "1" }] }),
      ),
    ).toEqual([])
  })

  test("an update across versions lists each name once", () => {
    expect(
      mergeVersionChanges([
        [{ category: "tags", added: ["VIP"], changed: [], removed: [] }],
        [
          {
            category: "tags",
            added: ["VIP", "Lead"],
            changed: [],
            removed: [],
          },
        ],
      ]),
    ).toEqual([
      { category: "tags", added: ["VIP", "Lead"], changed: [], removed: [] },
    ])
  })

  test("a settings entry shows by its name", () => {
    expect(
      describeVersionChanges(
        payload({}),
        payload({ botFields: [{ sourceId: "5", name: "city" }] }),
      ),
    ).toEqual([
      { category: "settings", added: ["city"], changed: [], removed: [] },
    ])
  })
})
