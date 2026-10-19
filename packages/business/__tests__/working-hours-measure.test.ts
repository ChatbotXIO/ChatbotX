import { describe, expect, test } from "vitest"
import { resolveMeasuredFrom } from "../src/working-hours/measure"

const at = (hhmm: string) => new Date(`2026-10-19T${hhmm}:00Z`)

describe("resolveMeasuredFrom (D7)", () => {
  const closedAwaitingSince = at("09:00")

  test("nobody assigned -> from the customer message", () => {
    expect(
      resolveMeasuredFrom({
        closedAwaitingSince,
        assignedUserId: null,
        assignedUserAt: null,
        adminId: "binh",
      }),
    ).toEqual(closedAwaitingSince)
  })

  test("assigned to the replying agent after the message -> from assignment", () => {
    expect(
      resolveMeasuredFrom({
        closedAwaitingSince,
        assignedUserId: "binh",
        assignedUserAt: at("11:00"),
        adminId: "binh",
      }),
    ).toEqual(at("11:00"))
  })

  test("assigned before the message -> from the message", () => {
    expect(
      resolveMeasuredFrom({
        closedAwaitingSince,
        assignedUserId: "binh",
        assignedUserAt: at("08:00"),
        adminId: "binh",
      }),
    ).toEqual(closedAwaitingSince)
  })

  test("assigned at the exact message instant -> from the message", () => {
    expect(
      resolveMeasuredFrom({
        closedAwaitingSince,
        assignedUserId: "binh",
        assignedUserAt: at("09:00"),
        adminId: "binh",
      }),
    ).toEqual(closedAwaitingSince)
  })

  test("assigned to another agent who is not the replier -> from the message", () => {
    expect(
      resolveMeasuredFrom({
        closedAwaitingSince,
        assignedUserId: "an",
        assignedUserAt: at("11:00"),
        adminId: "binh",
      }),
    ).toEqual(closedAwaitingSince)
  })

  test("reassigned An -> Binh at 10:00 uses the latest assignment", () => {
    expect(
      resolveMeasuredFrom({
        closedAwaitingSince,
        assignedUserId: "binh",
        assignedUserAt: at("10:00"),
        adminId: "binh",
      }),
    ).toEqual(at("10:00"))
  })

  test("stale assignedUserAt with no assignedUserId (user deleted) is ignored", () => {
    expect(
      resolveMeasuredFrom({
        closedAwaitingSince,
        assignedUserId: null,
        assignedUserAt: at("11:00"),
        adminId: "binh",
      }),
    ).toEqual(closedAwaitingSince)
  })

  test("team-only assignment (null user, null at) never moves the start", () => {
    expect(
      resolveMeasuredFrom({
        closedAwaitingSince,
        assignedUserId: undefined,
        assignedUserAt: undefined,
        adminId: "binh",
      }),
    ).toEqual(closedAwaitingSince)
  })

  test("assignedUserId matches but assignedUserAt is null -> from the message", () => {
    expect(
      resolveMeasuredFrom({
        closedAwaitingSince,
        assignedUserId: "binh",
        assignedUserAt: null,
        adminId: "binh",
      }),
    ).toEqual(closedAwaitingSince)
  })
})
