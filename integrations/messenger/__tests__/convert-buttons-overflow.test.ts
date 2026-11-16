import { beforeEach, describe, expect, test, vi } from "vitest"
import { MAX_BUTTONS } from "../src/constants"
import { convertButtons } from "../src/handlers/message/outgoing-message/send-button"
import { logger } from "../src/lib/logger"

const button = (id: string) =>
  ({
    id,
    label: `Button ${id}`,
    buttonType: null,
    beforeStep: null,
    steps: [],
  }) as never

const buttons = (count: number) =>
  Array.from({ length: count }, (_, index) => button(String(index + 1)))

/**
 * The channel's button template takes MAX_BUTTONS. A node authored for a
 * channel with a higher limit (LINE: 5) can still reach this channel, so the
 * extra buttons are dropped and a warning makes that visible.
 */
describe("convertButtons over the channel's button limit", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("keeps the first MAX_BUTTONS and warns about the rest", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)

    const result = convertButtons({
      flowId: "1",
      flowVersionId: "2",
      buttons: buttons(5),
    })

    expect(result).toHaveLength(MAX_BUTTONS)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      { flowId: "1", flowVersionId: "2", kept: MAX_BUTTONS, dropped: 2 },
      "Dropping step buttons over the channel's button limit",
    )
  })

  test("does not warn at the limit", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)

    const result = convertButtons({
      flowId: "1",
      buttons: buttons(MAX_BUTTONS),
    })

    expect(result).toHaveLength(MAX_BUTTONS)
    expect(warn).not.toHaveBeenCalled()
  })
})
