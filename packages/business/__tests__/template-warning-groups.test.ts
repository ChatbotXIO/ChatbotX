// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/repositories", () => ({
  loadResourceLabels: vi.fn(),
}))

const { countInstallerWarnings, groupInstallationWarnings } = await import(
  "../src/template/warning-groups"
)
const { loadResourceLabels } = await import(
  "@chatbotx.io/database/repositories"
)
const { loadInstallationWarningGroups } = await import(
  "../src/template/warning-groups"
)

const warning = (entityKind: string, path: string, value: string) => ({
  category: "flows",
  entityKind,
  path,
  value,
})

describe("groupInstallationWarnings", () => {
  test("one group per resource, named, its issues counted, left-out ones first", () => {
    const groups = groupInstallationWarnings(
      [
        warning("referenceRemoved", "flows.1.nodes[0].a", "1"),
        warning("referenceRemoved", "flows.1.nodes[1].a", "1"),
        warning("pipeline", "flows.2.nodes[0].pipelineId", "99"),
        warning("flowSkippedRequiredReference", "flows.2.nodes[0].a", "2"),
      ],
      (_category, sourceId) => (sourceId === "2" ? "Sales flow" : undefined),
    )

    expect(groups).toEqual([
      {
        category: "flows",
        sourceId: "2",
        name: "Sales flow",
        skipped: true,
        issues: [
          { code: "pipeline", count: 1 },
          { code: "flowSkippedRequiredReference", count: 1 },
        ],
      },
      {
        category: "flows",
        sourceId: "1",
        name: null,
        skipped: false,
        issues: [{ code: "referenceRemoved", count: 2 }],
      },
    ])
  })

  test("a warning with no resource in its path groups by its value", () => {
    const [group] = groupInstallationWarnings(
      [warning("custom", "settings.x", "qa-file")],
      () => undefined,
    )

    expect(group).toMatchObject({ sourceId: null, name: "qa-file" })
  })
})

describe("loadInstallationWarningGroups", () => {
  const warnings = [
    warning("pipeline", "flows.1.nodes[0].pipelineId", "99"),
    warning("flowSkippedRequiredReference", "flows.1.nodes[0].a", "1"),
    warning("workspaceMember", "flows.2.nodes[0].assigneeMemberIds[0]", "7"),
    warning("credentialRequired", "flows.3.auth", "X-Key"),
  ]
  const codesFor = async (audience: "installer" | "publisher") => {
    vi.mocked(loadResourceLabels).mockResolvedValue(new Map())
    const groups = await loadInstallationWarningGroups("1", warnings, audience)
    return groups.flatMap((group) => group.issues.map((issue) => issue.code))
  }

  test("the installer sees what did not arrive and what to do, not the template's dangling references", async () => {
    expect(await codesFor("installer")).toEqual([
      "flowSkippedRequiredReference",
      "credentialRequired",
    ])
    expect(countInstallerWarnings(warnings)).toBe(2)
  })

  test("the publisher sees everything but the members that never travel", async () => {
    expect(await codesFor("publisher")).toEqual([
      "pipeline",
      "flowSkippedRequiredReference",
      "credentialRequired",
    ])
  })
})
