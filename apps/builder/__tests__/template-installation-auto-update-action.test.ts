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

  it("points the installs table cell and the sync card at it", () => {
    for (const file of [
      "components/install-auto-update-cell.tsx",
      "components/template-installation-sync-card.tsx",
    ]) {
      expect(read(file)).toContain("set-installation-auto-update.action")
    }
  })

  it("loads the share token on demand instead of reading it from the list item", () => {
    expect(read("components/share-template-dialog.tsx")).toContain(
      "getShareSettingsAction",
    )
  })
})
