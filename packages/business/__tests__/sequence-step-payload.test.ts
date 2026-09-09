// @vitest-environment node

import { describe, expect, test } from "vitest"
import { buildCreateData, buildUpdateData } from "../src/sequence/step-payload"

describe("buildCreateData", () => {
  test("applies defaults for every optional field when omitted", () => {
    const result = buildCreateData({ order: 1 }, "seq-1", "step-1")

    expect(result).toEqual({
      id: "step-1",
      sequenceId: "seq-1",
      order: 1,
      delayDays: 1,
      delayMinutes: 0,
      delayUnit: "days",
      flowId: null,
      specificDateTime: null,
      isActive: true,
      anytime: true,
      sendTimeStart: null,
      sendTimeEnd: null,
      sendDays: null,
    })
  })

  test("keeps explicit values instead of defaults", () => {
    const result = buildCreateData(
      {
        order: 2,
        delayDays: 5,
        delayMinutes: 30,
        delayUnit: "hours",
        flowId: "flow-1",
        isActive: false,
        anytime: false,
      },
      "seq-1",
      "step-1",
    )

    expect(result).toMatchObject({
      delayDays: 5,
      delayMinutes: 30,
      delayUnit: "hours",
      flowId: "flow-1",
      isActive: false,
      anytime: false,
    })
  })

  test("converts specificDateTime string to a Date", () => {
    const result = buildCreateData(
      { order: 1, specificDateTime: "2026-01-01T10:00:00.000Z" },
      "seq-1",
      "step-1",
    )

    expect(result.specificDateTime).toEqual(
      new Date("2026-01-01T10:00:00.000Z"),
    )
  })

  test("nulls specificDateTime when omitted or empty", () => {
    expect(
      buildCreateData({ order: 1, specificDateTime: null }, "seq-1", "step-1")
        .specificDateTime,
    ).toBeNull()
    expect(
      buildCreateData({ order: 1, specificDateTime: "" }, "seq-1", "step-1")
        .specificDateTime,
    ).toBeNull()
  })

  test("converts empty-string sendTimeStart/sendTimeEnd to null (|| semantics)", () => {
    const result = buildCreateData(
      { order: 1, sendTimeStart: "", sendTimeEnd: "" },
      "seq-1",
      "step-1",
    )

    expect(result.sendTimeStart).toBeNull()
    expect(result.sendTimeEnd).toBeNull()
  })

  test("keeps non-empty sendTimeStart/sendTimeEnd", () => {
    const result = buildCreateData(
      { order: 1, sendTimeStart: "09:00", sendTimeEnd: "17:00" },
      "seq-1",
      "step-1",
    )

    expect(result.sendTimeStart).toBe("09:00")
    expect(result.sendTimeEnd).toBe("17:00")
  })

  test("serializes sendDays to JSON, or null when omitted", () => {
    expect(
      buildCreateData({ order: 1, sendDays: ["mon", "tue"] }, "seq-1", "step-1")
        .sendDays,
    ).toBe(JSON.stringify(["mon", "tue"]))
    expect(buildCreateData({ order: 1 }, "seq-1", "step-1").sendDays).toBeNull()
  })
})

describe("buildUpdateData", () => {
  test("omits every field the caller did not supply (no defaulting)", () => {
    const result = buildUpdateData({ order: 3 })

    expect(result).toEqual({ order: 3 })
  })

  test("only includes fields explicitly present in the input", () => {
    const result = buildUpdateData({
      order: 1,
      delayDays: 2,
      isActive: false,
    })

    expect(result).toEqual({ order: 1, delayDays: 2, isActive: false })
    expect(result).not.toHaveProperty("delayMinutes")
    expect(result).not.toHaveProperty("delayUnit")
  })

  test("converts specificDateTime string to Date when present", () => {
    const result = buildUpdateData({
      order: 1,
      specificDateTime: "2026-06-15T08:00:00.000Z",
    })

    expect(result.specificDateTime).toEqual(
      new Date("2026-06-15T08:00:00.000Z"),
    )
  })

  test("nulls specificDateTime when explicitly set to null or empty string", () => {
    expect(
      buildUpdateData({ order: 1, specificDateTime: null }).specificDateTime,
    ).toBeNull()
    expect(
      buildUpdateData({ order: 1, specificDateTime: "" }).specificDateTime,
    ).toBeNull()
  })

  test("converts empty-string sendTimeStart/sendTimeEnd to null when present", () => {
    const result = buildUpdateData({
      order: 1,
      sendTimeStart: "",
      sendTimeEnd: "",
    })

    expect(result.sendTimeStart).toBeNull()
    expect(result.sendTimeEnd).toBeNull()
  })

  test("serializes sendDays to JSON when present", () => {
    const result = buildUpdateData({ order: 1, sendDays: ["wed"] })

    expect(result.sendDays).toBe(JSON.stringify(["wed"]))
  })

  test("nulls sendDays when explicitly set to an empty array is not the same as omitted", () => {
    const result = buildUpdateData({ order: 1, sendDays: [] })

    // `sendDays ? JSON.stringify(sendDays) : null` — an empty array is
    // truthy, so it serializes rather than nulling.
    expect(result.sendDays).toBe(JSON.stringify([]))
  })
})
