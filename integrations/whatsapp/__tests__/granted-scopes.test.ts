import { describe, expect, it } from "vitest"
import { grantedScopesForWaba } from "../src/api/granted-scopes"

describe("grantedScopesForWaba", () => {
  it("keeps whatsapp_business_manage_events when Meta records it on the Business Presence account instead of the WABA", () => {
    // Shape of the real debug_token Meta support walked through: the WABA id
    // is on the management/messaging lines, but manage_events only lists the
    // matching Business Presence account ids.
    const scopes = grantedScopesForWaba(
      [
        {
          scope: "whatsapp_business_management",
          target_ids: ["1650096089666441", "1606681630903299"],
        },
        {
          scope: "whatsapp_business_messaging",
          target_ids: ["1650096089666441", "1606681630903299"],
        },
        {
          scope: "whatsapp_business_manage_events",
          target_ids: ["27354777577529205", "1053913244099763"],
        },
      ],
      "1606681630903299",
    )

    expect(scopes).toEqual([
      "whatsapp_business_management",
      "whatsapp_business_messaging",
      "whatsapp_business_manage_events",
    ])
  })

  it("still drops a WABA-scoped permission whose targets exclude the WABA", () => {
    const scopes = grantedScopesForWaba(
      [
        { scope: "whatsapp_business_management", target_ids: ["waba-other"] },
        { scope: "whatsapp_business_messaging", target_ids: ["waba-1"] },
      ],
      "waba-1",
    )

    expect(scopes).toEqual(["whatsapp_business_messaging"])
  })

  it("keeps a permission granted without target ids", () => {
    expect(
      grantedScopesForWaba(
        [
          { scope: "business_management" },
          { scope: "whatsapp_business_messaging", target_ids: [] },
        ],
        "waba-1",
      ),
    ).toEqual(["business_management", "whatsapp_business_messaging"])
  })

  it("returns nothing when the token carries no granular scopes", () => {
    expect(grantedScopesForWaba(undefined, "waba-1")).toEqual([])
  })
})
