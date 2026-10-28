import { describe, expect, test } from "vitest"
import { resolveWorkspaceSkeletonKind } from "@/components/workspace-skeletons"

describe("resolveWorkspaceSkeletonKind", () => {
  test.each([
    ["/space/1/inbox", "inbox"],
    ["/space/1/dashboard", "dashboard"],
    ["/space/1/dashboard/contacts", "dashboard"],
    ["/space/1/flows", "tabbed"],
    ["/space/1/tags", "tabbed"],
    ["/space/1/flows/12", "flowEditor"],
    ["/space/1/flows/import", "page"],
    ["/space/1/settings", "tabbed"],
    ["/space/1/settings/general", "tabbed"],
    ["/space/1/settings/channels", "tabbed"],
    ["/space/1/settings/user-persistent-menus/create", "form"],
    ["/space/1/broadcasts/create", "form"],
    ["/space/1/products/5/edit", "form"],
    ["/space/1/sequences/12", "form"],
    ["/space/1/contacts", "page"],
    ["/space/1/broadcasts/5/runs", "page"],
  ])("%s → %s", (pathname, kind) => {
    expect(resolveWorkspaceSkeletonKind(pathname)).toBe(kind)
  })
})
