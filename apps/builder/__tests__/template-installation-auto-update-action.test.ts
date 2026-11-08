import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const templates = join(import.meta.dirname, "../src/features/templates")
const read = (path: string) => readFileSync(join(templates, path), "utf8")

describe("template installation auto-update action", () => {
  it("keeps a single server action for the auto-update toggle", () => {
    expect(
      existsSync(
        join(templates, "actions/update-installation-auto-update.action.ts"),
      ),
    ).toBe(false)
    expect(
      existsSync(
        join(templates, "actions/set-installation-auto-update.action.ts"),
      ),
    ).toBe(true)
  })

  it("routes the installs table and the sync card through one switch cell", () => {
    expect(read("components/install-auto-update-cell.tsx")).toContain(
      "set-installation-auto-update.action",
    )
    expect(read("components/template-installation-sync-card.tsx")).toContain(
      "./install-auto-update-cell",
    )
    expect(read("components/template-installs-table.tsx")).toContain(
      "./install-auto-update-cell",
    )
  })

  it("loads the share token on demand instead of reading it from the list item", () => {
    expect(read("components/share-template-dialog.tsx")).toContain(
      "getShareSettingsAction",
    )
  })
})
