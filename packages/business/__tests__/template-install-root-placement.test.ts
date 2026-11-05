// @vitest-environment node
import { describe, expect, test } from "vitest"
import { installRootSourceId } from "../src/template/adapters/manifests/resolve"
import {
  placeRootEntriesInInstallRoots,
  rootLevelFolderTypes,
} from "../src/template/install-root-placement"

const resources = (overrides: Record<string, unknown>) =>
  ({
    flows: [],
    triggers: [],
    sequences: [],
    keywords: [],
    fbCommentAutomations: [],
    settings: { savedReplies: [], botFields: [] },
    ...overrides,
  }) as never

describe("install root placement", () => {
  // Root-level bot fields used to stay in the workspace root while the rest of
  // the template moved into its install folder.
  test("a root-level bot field goes into the custom-field install root", () => {
    const input = resources({
      settings: {
        savedReplies: [{ sourceId: "r1", shortcut: "hi" }],
        botFields: [
          { sourceId: "b1", name: "score", folderId: null },
          { sourceId: "b2", name: "rank", folderId: "f-shipped" },
        ],
      },
    })

    expect(rootLevelFolderTypes(input)).toEqual(["customField"])
    const placed = placeRootEntriesInInstallRoots(input) as unknown as {
      settings: {
        savedReplies: Record<string, unknown>[]
        botFields: Record<string, unknown>[]
      }
    }
    expect(placed.settings.botFields).toEqual([
      {
        sourceId: "b1",
        name: "score",
        folderId: installRootSourceId("customField"),
      },
      { sourceId: "b2", name: "rank", folderId: "f-shipped" },
    ])
    // The payload keeps its shape: no `kind` leaks back, replies untouched.
    expect(placed.settings.savedReplies).toEqual([
      { sourceId: "r1", shortcut: "hi" },
    ])
  })

  test("each foldered category files root entries in its own namespace", () => {
    const input = resources({
      flows: [{ sourceId: "f1", folderId: null }],
      keywords: [
        { sourceId: "k1", type: "inbound", folderId: null },
        { sourceId: "k2", type: "outbound" },
      ],
      triggers: [{ sourceId: "t1", folderId: "f-shipped" }],
    })

    expect(rootLevelFolderTypes(input).sort()).toEqual(
      ["automatedResponse", "flow", "outboundAutomatedResponse"].sort(),
    )
    const placed = placeRootEntriesInInstallRoots(input) as unknown as Record<
      string,
      { folderId?: string }[]
    >
    expect(placed.flows?.[0]?.folderId).toBe(installRootSourceId("flow"))
    expect(placed.triggers?.[0]?.folderId).toBe("f-shipped")
  })

  test("does not mutate its input", () => {
    const flow = { sourceId: "f1", folderId: null }
    placeRootEntriesInInstallRoots(resources({ flows: [flow] }))
    expect(flow.folderId).toBeNull()
  })
})
