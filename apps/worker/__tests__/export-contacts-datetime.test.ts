import { describe, expect, test } from "vitest"
import {
  buildCsvChunk,
  type SelectedField,
} from "../src/default/handlers/export-contacts"

describe("export contacts datetime rendering", () => {
  test("formats custom date and datetime fields in the workspace timezone", () => {
    const selectedFields: SelectedField[] = [
      {
        type: "custom",
        value: "date-field",
        header: "Date",
        customFieldType: "date",
      },
      {
        type: "custom",
        value: "datetime-field",
        header: "Datetime",
        customFieldType: "datetime",
      },
    ]

    const contacts = [
      {
        contactCustomFields: [
          {
            customFieldId: "date-field",
            value: "2026-07-22T00:00:00+07:00",
          },
          {
            customFieldId: "datetime-field",
            value: "2026-07-22T08:30:00.000Z",
          },
        ],
        contactInboxes: [],
        tags: [],
      },
    ] as Parameters<typeof buildCsvChunk>[0]

    expect(buildCsvChunk(contacts, selectedFields, "Asia/Ho_Chi_Minh")).toBe(
      '"2026-07-22","2026-07-22 15:30:00"\n',
    )
  })
})
