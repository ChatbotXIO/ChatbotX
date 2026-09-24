// @vitest-environment node

import { describe, expect, test } from "vitest"
import { EMPTY_CONTACT_FILTER } from "@/features/contact-filter"
import { getContactsListInput } from "@/features/contacts/lib/contact-list-input"

describe("contacts table query input", () => {
  test("preserves keyword and sort while committing an edited filter at page one", () => {
    const input = getContactsListInput(
      "workspace-1",
      {
        page: "1",
        keyword: "Ada",
        sort: JSON.stringify([{ id: "fullName", desc: false }]),
      },
      {
        operator: "and",
        conditions: [{ field: "inbox", operator: "eq", value: ["inbox-1"] }],
      },
    )

    expect(input).toEqual({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 50,
      keyword: "Ada",
      sort: [{ id: "fullName", desc: false }],
      contactFilter: {
        operator: "and",
        conditions: [{ field: "inbox", operator: "eq", value: ["inbox-1"] }],
      },
    })
  })

  test("clearing the local filter produces an unfiltered request", () => {
    const input = getContactsListInput(
      "workspace-1",
      {
        contactFilter: JSON.stringify({
          operator: "and",
          conditions: [{ field: "inbox", operator: "eq", value: ["inbox-1"] }],
        }),
      },
      EMPTY_CONTACT_FILTER,
    )

    expect(input.contactFilter).toBeUndefined()
  })
})
