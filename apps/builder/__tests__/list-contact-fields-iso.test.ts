// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"
import { listContactCustomFields } from "@/features/contacts/queries/list-contact-fields.query"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findByIdOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactService: {
    findByIdOrFail: mocks.findByIdOrFail,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactCustomFieldModel: {
        findMany: mocks.findMany,
      },
    },
  },
}))

describe("listContactCustomFields", () => {
  beforeEach(() => {
    mocks.findMany.mockReset()
    mocks.findByIdOrFail.mockReset()
  })

  test("returns temporal custom-field ISO values verbatim", async () => {
    mocks.findMany.mockResolvedValue([
      {
        value: "2026-07-22T00:00:00+07:00",
        customField: {
          id: "cf-date",
          name: "Birthday",
          type: "date",
        },
      },
      {
        value: "2026-07-22T08:30:00.000Z",
        customField: {
          id: "cf-datetime",
          name: "Appointment",
          type: "datetime",
        },
      },
    ])

    const result = await listContactCustomFields({
      workspaceId: "workspace-1",
      contactId: "contact-1",
    })

    expect(result.data).toEqual([
      {
        id: "cf-date",
        name: "Birthday",
        type: "date",
        value: "2026-07-22T00:00:00+07:00",
      },
      {
        id: "cf-datetime",
        name: "Appointment",
        type: "datetime",
        value: "2026-07-22T08:30:00.000Z",
      },
    ])
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        contactId: "contact-1",
        customField: {
          workspaceId: "workspace-1",
        },
      },
      with: {
        customField: true,
      },
    })
  })
})
