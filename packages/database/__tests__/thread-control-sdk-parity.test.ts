import {
  THREAD_CONTROL_STEP_METADATA_MAX_LENGTH,
  threadControlStepTargetRoles,
} from "@chatbotx.io/flow-config"
import {
  threadControlActions as sdkActions,
  threadControlRoles as sdkRoles,
} from "@chatbotx.io/sdk"
import { describe, expect, it } from "vitest"
import {
  THREAD_CONTROL_METADATA_MAX_LENGTH,
  threadControlActions,
  threadControlRoles,
} from "../src/partials"

describe("thread-control SDK parity", () => {
  it("keeps the SDK role values identical to the persisted ones", () => {
    expect(sdkRoles.options).toEqual(threadControlRoles.options)
  })

  it("keeps the SDK action values identical to the persisted ones", () => {
    expect(sdkActions.options).toEqual(threadControlActions.options)
  })

  it("keeps the flow step's pass targets identical to the persisted roles", () => {
    expect(threadControlStepTargetRoles.options).toEqual(
      threadControlRoles.options,
    )
  })

  it("keeps the flow step's note limit identical to the persisted one", () => {
    expect(THREAD_CONTROL_STEP_METADATA_MAX_LENGTH).toBe(
      THREAD_CONTROL_METADATA_MAX_LENGTH,
    )
  })
})
