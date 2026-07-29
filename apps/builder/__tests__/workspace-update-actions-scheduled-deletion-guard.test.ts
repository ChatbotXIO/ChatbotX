// @vitest-environment node

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const actionSource = readFileSync(
  join(
    process.cwd(),
    "src/features/workspaces/actions/update-workspace-action.ts",
  ),
  "utf8",
)

describe("workspace update actions scheduled-deletion guard", () => {
  test("allows only general settings updates during the deletion grace window", () => {
    expect(actionSource).toContain(
      "updateWorkspaceBasicAction =\n  workspaceActionClientAllowScheduledDeletion",
    )
    expect(actionSource).toContain(
      "updateWorkspaceAdvancedAction =\n  workspaceActionClientAllowScheduledDeletion",
    )
    expect(actionSource).toContain(
      "updateSmartResponseDelayAction = workspaceActionClient",
    )
  })
})
