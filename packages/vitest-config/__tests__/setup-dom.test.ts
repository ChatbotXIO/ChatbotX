// @vitest-environment jsdom

import { describe, expect, test } from "vitest"
import "../src/setup-dom.ts"

/**
 * Contract tests for the DOM gaps `setup-dom` fills. The polyfills install as
 * import-time side effects, so importing the module above is the whole setup.
 *
 * `getAnimations` is the gap Base UI's `ScrollAreaViewport` falls into: it
 * guards its layout effect on `ResizeObserver` existing, and once that stub is
 * in place it schedules `viewport.getAnimations({ subtree: true })` on a 0ms
 * timeout. A suite driving fake timers fires that timeout and jsdom — which
 * implements no Web Animations API — throws `not a function`, taking the whole
 * file down through an unhandled rejection.
 */
describe("setup-dom polyfills", () => {
  test("getAnimations answers the Base UI ScrollArea call with no animations", () => {
    const viewport = document.createElement("div")

    expect(viewport.getAnimations({ subtree: true })).toEqual([])
  })

  test("getAnimations is callable without options", () => {
    const element = document.createElement("div")

    expect(element.getAnimations()).toEqual([])
  })

  test("getAnimations hands back a fresh array per call", () => {
    const element = document.createElement("div")

    const first = element.getAnimations()
    first.push(null as unknown as Animation)

    expect(element.getAnimations()).toEqual([])
  })

  test("ResizeObserver constructs and observes without throwing", () => {
    const observer = new ResizeObserver(() => {
      // no-op
    })

    expect(() => observer.observe(document.createElement("div"))).not.toThrow()
    observer.disconnect()
  })
})
