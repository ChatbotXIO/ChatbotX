import { DEEP_LINK_APPS } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { labelKeyByAppId } from "@/features/open-link/components/open-link-button"
import en from "../messages/en.json"

describe("deep-link button labels", () => {
  test("every app in the table has a translated button label", () => {
    // TypeScript already forces a map entry per app. What it cannot see is
    // whether that entry names a key the catalog actually has — a missing one
    // renders the raw key to a contact with no build error.
    const missing = DEEP_LINK_APPS.filter(
      (app) => !(labelKeyByAppId[app.id] in en.openLink),
    ).map((app) => app.id)

    expect(missing).toEqual([])
  })
})
