import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import AnalysisFilterForm from "../src/components/filter-form"

const mockSetRange = vi.fn()

vi.mock("../src/provider/analysis-store-context", () => ({
  useAnalysisStore: (
    selector: (state: { setRange: typeof mockSetRange }) => unknown,
  ) => selector({ setRange: mockSetRange }),
}))

// `DateRangePresetFilter`'s own UI/preset behavior is covered by
// `date-range-preset-filter.test.tsx`. This mock isolates the one thing
// `AnalysisFilterForm` is actually responsible for now that it's a thin
// wrapper: forwarding every applied range to both the caller's `onChange`
// AND the shared analytics store.
const FAKE_RANGE = {
  from: new Date("2026-08-01T00:00:00.000Z"),
  to: new Date("2026-08-10T23:59:59.999Z"),
}

vi.mock("../src/components/date-range-preset-filter", () => ({
  DateRangePresetFilter: ({
    onChange,
  }: {
    onChange: (range: typeof FAKE_RANGE) => void
  }) => (
    <button onClick={() => onChange(FAKE_RANGE)} type="button">
      apply-fake-range
    </button>
  ),
}))

describe("AnalysisFilterForm — store-wired delegation to DateRangePresetFilter", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mockSetRange.mockClear()
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

  test("an applied range is written to the analysis store (Contacts/Conversations fetch trigger)", async () => {
    await act(async () => {
      root.render(<AnalysisFilterForm defaultPreset="last7" />)
      await Promise.resolve()
    })

    await act(async () => {
      container.querySelector("button")?.click()
      await Promise.resolve()
    })

    expect(mockSetRange).toHaveBeenCalledTimes(1)
    expect(mockSetRange).toHaveBeenCalledWith(FAKE_RANGE)
  })

  test("an applied range is also forwarded to the caller's onChange prop", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(
        <AnalysisFilterForm defaultPreset="last7" onChange={onChange} />,
      )
      await Promise.resolve()
    })

    await act(async () => {
      container.querySelector("button")?.click()
      await Promise.resolve()
    })

    expect(onChange).toHaveBeenCalledWith(FAKE_RANGE)
    expect(mockSetRange).toHaveBeenCalledWith(FAKE_RANGE)
  })
})
