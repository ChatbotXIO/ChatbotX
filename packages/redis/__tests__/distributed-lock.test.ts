import { LockAcquisitionError } from "redlock-universal"
import { describe, expect, test } from "vitest"
import { isLockAcquisitionError } from "../src/distributed-lock"

const lockAcquisitionError = (key: string) =>
  Object.assign(new Error("lock unavailable"), {
    name: "LockAcquisitionError",
    code: "LOCK_ACQUISITION_FAILED",
    key,
  })

describe("isLockAcquisitionError", () => {
  test("recognizes a redlock-universal error and scopes it to an optional key", () => {
    const error = new LockAcquisitionError("ingress:conv:1", 2)

    expect(isLockAcquisitionError(error)).toBe(true)
    expect(isLockAcquisitionError(error, "ingress:conv:1")).toBe(true)
    expect(isLockAcquisitionError(error, "msg:upsert:1:source-1")).toBe(false)
  })

  test("recognizes the structural error shape used by worker fixtures", () => {
    const error = lockAcquisitionError("schedule:purge-workspaces")

    expect(isLockAcquisitionError(error)).toBe(true)
    expect(isLockAcquisitionError(error, "schedule:purge-workspaces")).toBe(
      true,
    )
    expect(isLockAcquisitionError(error, "schedule:other")).toBe(false)
  })

  test("rejects incomplete lock-like errors and non-errors", () => {
    expect(
      isLockAcquisitionError(
        Object.assign(new Error("missing code"), {
          name: "LockAcquisitionError",
          key: "ingress:conv:1",
        }),
      ),
    ).toBe(false)
    expect(isLockAcquisitionError(new Error("unrelated"))).toBe(false)
    expect(isLockAcquisitionError(null)).toBe(false)
    expect(isLockAcquisitionError("lock unavailable")).toBe(false)
  })
})
