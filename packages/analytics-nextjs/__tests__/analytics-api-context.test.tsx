import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  type AnalyticsApi,
  AnalyticsApiProvider,
  useAnalyticsApi,
} from "../src/provider/analytics-api-context"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe("useAnalyticsApi", () => {
  test("returns the api handed to the provider", () => {
    const api = { marker: "analytics" } as unknown as AnalyticsApi
    let seen: AnalyticsApi | undefined

    const Probe = () => {
      seen = useAnalyticsApi()
      return null
    }

    act(() => {
      root.render(
        <AnalyticsApiProvider api={api}>
          <Probe />
        </AnalyticsApiProvider>,
      )
    })

    expect(seen).toBe(api)
  })

  test("throws instead of silently returning undefined without a provider", () => {
    const Probe = () => {
      useAnalyticsApi()
      return null
    }

    expect(() => {
      act(() => {
        root.render(<Probe />)
      })
    }).toThrow("useAnalyticsApi must be used within AnalyticsApiProvider")
  })
})
