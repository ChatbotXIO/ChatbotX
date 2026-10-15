import { beforeEach, describe, expect, test, vi } from "vitest"

const { contactService, mergeRichSystemFields } = await import(
  "../src/contact/service"
)

describe("mergeRichSystemFields", () => {
  test("maps each field to its columns", () => {
    expect(
      mergeRichSystemFields({
        first_name: "John",
        last_name: "Silva",
        email: "j@x.co",
        phone: "+84901234567",
      }),
    ).toEqual({
      firstName: "John",
      lastName: "Silva",
      email: "j@x.co",
      phoneNumber: "+84901234567",
    })
  })

  test("splits a full name into first and last", () => {
    expect(mergeRichSystemFields({ full_name: "John Michael Silva" })).toEqual({
      firstName: "John",
      lastName: "Michael Silva",
    })
  })

  test("later fields win where they overlap, like sequential writes", () => {
    expect(
      mergeRichSystemFields({ first_name: "Ann", full_name: "John Silva" }),
    ).toEqual({ firstName: "John", lastName: "Silva" })
    expect(
      mergeRichSystemFields({ full_name: "John Silva", last_name: "Doe" }),
    ).toEqual({ firstName: "John", lastName: "Doe" })
  })

  test("is empty for no fields", () => {
    expect(mergeRichSystemFields({})).toEqual({})
  })
})

describe("contactService.applyRichSystemFields", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("writes every field in ONE update", async () => {
    const update = vi
      .spyOn(contactService, "update")
      .mockResolvedValue({ id: "c-1" } as never)

    await contactService.applyRichSystemFields({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: { first_name: "John", email: "j@x.co" },
    })

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "c-1" },
      { firstName: "John", email: "j@x.co" },
      expect.anything(),
    )
  })

  test("does not touch the contact when there is nothing to write", async () => {
    const update = vi.spyOn(contactService, "update")

    await expect(
      contactService.applyRichSystemFields({
        workspaceId: "ws-1",
        contactId: "c-1",
        fields: {},
      }),
    ).resolves.toBeNull()
    expect(update).not.toHaveBeenCalled()
  })
})
