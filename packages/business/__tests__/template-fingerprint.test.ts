// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  fingerprintEntry,
  omitKeys,
  sortUnorderedPaths,
} from "../src/template/fingerprint"
import { hashTemplatePayload } from "../src/template/payload-hash"

describe("sortUnorderedPaths", () => {
  test("sorts only the declared sets, keeping every other array in order", () => {
    const value = { keywords: ["b", "a"], steps: [{ id: "2" }, { id: "1" }] }
    expect(sortUnorderedPaths(value, ["keywords"])).toEqual({
      keywords: ["a", "b"],
      steps: [{ id: "2" }, { id: "1" }],
    })
  })

  test("reaches a set inside every element with a wildcard path", () => {
    const value = { items: [{ tags: ["z", "a"] }, { tags: ["y", "b"] }] }
    expect(sortUnorderedPaths(value, ["items[].tags"])).toEqual({
      items: [{ tags: ["a", "z"] }, { tags: ["b", "y"] }],
    })
  })

  test("a path that is not there changes nothing", () => {
    const value = { a: [2, 1] }
    expect(sortUnorderedPaths(value, ["missing", "a.b"])).toEqual(value)
  })

  test("fingerprintEntry projects before sorting", () => {
    expect(
      fingerprintEntry(
        {
          project: (entry) => omitKeys(entry, ["folderId"]),
          unorderedPaths: ["k"],
        },
        { k: ["b", "a"], folderId: "1" },
      ),
    ).toEqual({ k: ["a", "b"] })
  })
})

const payload = (resources: Record<string, unknown>, extra = {}) => ({
  formatVersion: 2,
  exportedAt: "2026-01-01T00:00:00.000Z",
  source: { workspaceId: "1", tenantId: "1" },
  manifests: { tags: { "5": { name: "vip" } } },
  resources,
  ...extra,
})

const keyword = (overrides = {}) => ({
  sourceId: "k1",
  type: "inbound",
  text: "hi",
  keywords: ["a", "b", "c"],
  flowId: "f1",
  folderId: "d1",
  ...overrides,
})
const trigger = (overrides = {}) => ({
  sourceId: "t1",
  name: "T",
  active: true,
  folderId: null,
  actions: [{ id: "1" }, { id: "2" }],
  ...overrides,
})
const sequence = (overrides = {}) => ({
  sourceId: "s1",
  name: "S",
  active: true,
  folderId: null,
  steps: [{ order: 1 }, { order: 2 }],
  ...overrides,
})
const agent = (overrides = {}) => ({
  sourceId: "a1",
  name: "A",
  isDefault: false,
  webSearchAuthorizedDomains: ["x.com", "y.com"],
  messages: [
    { role: "user", content: "1" },
    { role: "user", content: "2" },
  ],
  ...overrides,
})
const flow = (overrides = {}) => ({
  sourceId: "f1",
  name: "F",
  active: true,
  enableInInbox: true,
  folderId: "d1",
  startNodeId: "n1",
  nodes: [{ id: "n1" }],
  edges: [],
  ...overrides,
})

const hashOf = async (resources: Record<string, unknown>, extra = {}) =>
  await hashTemplatePayload(payload(resources, extra))

describe("hashTemplatePayload: fingerprint stability", () => {
  const base = {
    keywords: [keyword()],
    triggers: [trigger()],
    sequences: [sequence()],
    aiAgents: [agent()],
    flows: [flow()],
    settings: {
      savedReplies: [
        { sourceId: "r1", kind: "savedReply", shortcut: "a", text: "b" },
      ],
      botFields: [
        { sourceId: "b1", kind: "botField", name: "n", folderId: "d1" },
      ],
    },
  }
  const reference = hashOf(base)

  test("reordering a declared set does not change the hash", async () => {
    expect(
      await hashOf({
        ...base,
        keywords: [keyword({ keywords: ["c", "a", "b"] })],
      }),
    ).toBe(await reference)
    expect(
      await hashOf({
        ...base,
        aiAgents: [agent({ webSearchAuthorizedDomains: ["y.com", "x.com"] })],
      }),
    ).toBe(await reference)
  })

  test("a different keyword set does", async () => {
    expect(
      await hashOf({ ...base, keywords: [keyword({ keywords: ["a", "b"] })] }),
    ).not.toBe(await reference)
  })

  test("order that is content still counts: actions, steps, messages", async () => {
    const changed = [
      { ...base, triggers: [trigger({ actions: [{ id: "2" }, { id: "1" }] })] },
      {
        ...base,
        sequences: [sequence({ steps: [{ order: 2 }, { order: 1 }] })],
      },
      {
        ...base,
        aiAgents: [
          agent({
            messages: [
              { role: "user", content: "2" },
              { role: "user", content: "1" },
            ],
          }),
        ],
      },
    ]
    for (const resources of changed) {
      expect(await hashOf(resources)).not.toBe(await reference)
    }
  })

  test("installer-owned fields do not change the hash", async () => {
    const same = [
      { ...base, keywords: [keyword({ folderId: "other" })] },
      { ...base, triggers: [trigger({ active: false, folderId: "x" })] },
      { ...base, sequences: [sequence({ active: false, folderId: "x" })] },
      { ...base, aiAgents: [agent({ isDefault: true })] },
      {
        ...base,
        flows: [flow({ active: false, enableInInbox: false, folderId: null })],
      },
      {
        ...base,
        settings: {
          ...base.settings,
          botFields: [
            { sourceId: "b1", kind: "botField", name: "n", folderId: "z" },
          ],
        },
      },
    ]
    for (const resources of same) {
      expect(await hashOf(resources)).toBe(await reference)
    }
  })

  test("envelope metadata does not change the hash", async () => {
    expect(
      await hashOf(base, {
        exportedAt: "2030-05-05T00:00:00.000Z",
        source: { workspaceId: "99", tenantId: "7" },
      }),
    ).toBe(await reference)
  })

  test("content, source ids, manifests and the format version still do", async () => {
    const changed = [
      await hashOf({ ...base, keywords: [keyword({ text: "bye" })] }),
      await hashOf({ ...base, keywords: [keyword({ sourceId: "k2" })] }),
      await hashOf({ ...base, flows: [flow({ name: "G" })] }),
      await hashOf({
        ...base,
        settings: {
          ...base.settings,
          savedReplies: [
            { sourceId: "r1", kind: "savedReply", shortcut: "a", text: "c" },
          ],
        },
      }),
      await hashTemplatePayload({
        ...payload(base),
        manifests: { tags: { "5": { name: "other" } } },
      }),
      await hashOf(base, { formatVersion: 1 }),
    ]
    for (const hash of changed) {
      expect(hash).not.toBe(await reference)
    }
  })
})
