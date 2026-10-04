import { expect, test } from "vitest"
import { connectionNotConfiguredException } from "../errors"

test("connectionNotConfiguredException is a client error for unsupported built-in operations", () => {
  expect(connectionNotConfiguredException("chatbotx")).toMatchObject({
    code: "connectionNotConfigured",
    httpStatusCode: 400,
  })
})
