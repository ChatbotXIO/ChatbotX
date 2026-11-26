// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  DashboardContentSkeleton,
  DashboardSharedFilterSkeleton,
  DashboardSkeleton,
  WorkspaceRouteSkeleton,
} from "@/components/workspace-skeletons"

const countControls = (html: string): number =>
  html.match(/h-9 w-/g)?.length ?? 0

describe("analytics skeletons match the shared filter row", () => {
  test("the shared row placeholder has the three controls", () => {
    expect(
      countControls(renderToStaticMarkup(<DashboardSharedFilterSkeleton />)),
    ).toBe(3)
  })

  test("the content skeleton keeps only the date row (the real shared row sits above it)", () => {
    expect(
      countControls(renderToStaticMarkup(<DashboardContentSkeleton />)),
    ).toBe(2)
  })

  test("the whole-page skeleton shows the shared row once, above the content", () => {
    const html = renderToStaticMarkup(<DashboardSkeleton />)

    expect(countControls(html)).toBe(5)
    expect(html.indexOf("sm:w-72")).toBeLessThan(html.indexOf("lg:grid-cols-4"))
  })

  test("the section select placeholder is as wide as the real select column", () => {
    expect(renderToStaticMarkup(<DashboardSharedFilterSkeleton />)).toContain(
      "sm:w-80",
    )
  })

  test("a registered section shows the shared row while loading", () => {
    const html = renderToStaticMarkup(
      <WorkspaceRouteSkeleton pathname="/space/1/dashboard/posts" />,
    )

    expect(countControls(html)).toBe(5)
  })

  test("a dashboard page that is not a section shows no shared row", () => {
    const html = renderToStaticMarkup(
      <WorkspaceRouteSkeleton pathname="/space/1/dashboard/ads/conversion-events" />,
    )

    expect(countControls(html)).toBe(2)
    expect(html).not.toContain("sm:w-72")
  })
})
