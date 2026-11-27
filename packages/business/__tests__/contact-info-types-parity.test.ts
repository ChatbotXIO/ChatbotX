import { contactInfoTypes } from "@chatbotx.io/database/partials"
import { contactInfoCaptureInfoTypeSchema } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"

describe("contact info types", () => {
  test("flow-config's event copy matches the database contactInfoTypes", () => {
    expect(contactInfoCaptureInfoTypeSchema.options).toEqual(
      contactInfoTypes.options,
    )
  })
})
