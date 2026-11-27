import { describe, expect, test } from "vitest"
import { getContactInputAttachments } from "../src/contact-inbox/input-attachments"

describe("getContactInputAttachments", () => {
  const attachments = [{ fileType: "image" }]

  test("keeps the attachments of an ordinary message", () => {
    expect(
      getContactInputAttachments({ contentAttributes: {}, attachments }),
    ).toEqual(attachments)
  })

  test("drops the files of a Flow response: they answer its fields", () => {
    expect(
      getContactInputAttachments({
        contentAttributes: {
          type: "whatsapp_flow_response",
          name: "flow",
          flowResponse: {},
          flowToken: null,
          decoded: null,
        },
        attachments,
      }),
    ).toEqual([])
  })

  test("is empty without attachments", () => {
    expect(getContactInputAttachments({ attachments: null })).toEqual([])
  })
})
