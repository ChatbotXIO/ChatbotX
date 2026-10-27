import { describe, expect, test } from "vitest"
import {
  canViewContactEmailAndPhone,
  FULL_PIPELINE_PERMISSIONS,
  NO_PIPELINE_PERMISSIONS,
  normalizePipelinePermissions,
  type PipelineAccessScope,
  permitsPipelineAction,
  resolvePipelinePermissions,
} from "../src/pipeline/access"

const member = (
  isWorkspaceAdmin: boolean,
  canViewContactEmailAndPhone = true,
): PipelineAccessScope => ({
  kind: "member",
  workspaceMemberId: "m-1",
  isWorkspaceAdmin,
  canViewContactEmailAndPhone,
})

const row = {
  canView: true,
  canEdit: false,
  canDelete: false,
  canManageSettings: false,
}

describe("resolvePipelinePermissions", () => {
  test.each<[string, PipelineAccessScope]>([
    ["a workspace token", { kind: "workspaceToken" }],
    ["a support session", { kind: "support" }],
    ["a workspace admin", member(true)],
  ])("%s bypasses the per-pipeline ACL, even with no member row", (_name, scope) => {
    expect(resolvePipelinePermissions(scope, null)).toEqual(
      FULL_PIPELINE_PERMISSIONS,
    )
  })

  test("a plain member without a row has no access at all", () => {
    expect(resolvePipelinePermissions(member(false), null)).toEqual(
      NO_PIPELINE_PERMISSIONS,
    )
  })

  test("a plain member holds exactly what their row grants", () => {
    expect(resolvePipelinePermissions(member(false), row)).toEqual(row)
  })

  test("an admin ignores a restrictive member row", () => {
    expect(resolvePipelinePermissions(member(true), row)).toEqual(
      FULL_PIPELINE_PERMISSIONS,
    )
  })
})

describe("normalizePipelinePermissions", () => {
  test.each([
    "canEdit",
    "canDelete",
    "canManageSettings",
  ] as const)("%s implies view", (flag) => {
    const normalized = normalizePipelinePermissions({
      ...NO_PIPELINE_PERMISSIONS,
      [flag]: true,
    })

    expect(normalized.canView).toBe(true)
  })

  test("leaves a view-only grant alone", () => {
    expect(normalizePipelinePermissions(row)).toEqual(row)
  })
})

describe("permitsPipelineAction", () => {
  test("maps each action to its own flag", () => {
    const permissions = {
      ...NO_PIPELINE_PERMISSIONS,
      canView: true,
      canEdit: true,
    }

    expect(permitsPipelineAction(permissions, "view")).toBe(true)
    expect(permitsPipelineAction(permissions, "edit")).toBe(true)
    expect(permitsPipelineAction(permissions, "delete")).toBe(false)
    expect(permitsPipelineAction(permissions, "manageSettings")).toBe(false)
  })
})

describe("canViewContactEmailAndPhone", () => {
  test("tokens and support sessions see contact email and phone", () => {
    expect(canViewContactEmailAndPhone({ kind: "workspaceToken" })).toBe(true)
    expect(canViewContactEmailAndPhone({ kind: "support" })).toBe(true)
  })

  test("a member follows their own contact permission", () => {
    expect(canViewContactEmailAndPhone(member(false, true))).toBe(true)
    expect(canViewContactEmailAndPhone(member(false, false))).toBe(false)
    // Pipeline admin rights do not grant contact PII.
    expect(canViewContactEmailAndPhone(member(true, false))).toBe(false)
  })
})
