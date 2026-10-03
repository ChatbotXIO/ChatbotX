import {
  threadControlActions as sdkActions,
  threadControlRoles as sdkRoles,
} from "@chatbotx.io/sdk"
import { describe, expect, it } from "vitest"
import { threadControlActions, threadControlRoles } from "../src/partials"

describe("thread-control SDK parity", () => {
  it("keeps the SDK role values identical to the persisted ones", () => {
    expect(sdkRoles.options).toEqual(threadControlRoles.options)
  })

  it("keeps the SDK action values identical to the persisted ones", () => {
    expect(sdkActions.options).toEqual(threadControlActions.options)
  })
})
