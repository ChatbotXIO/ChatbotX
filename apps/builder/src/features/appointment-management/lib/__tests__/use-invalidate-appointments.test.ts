// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}))

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

// The hook only wraps the callback; run it without a React renderer.
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
}))

vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    appointmentsAPI: { key: () => ["appointmentsAPI"] },
    appointmentCalendarsAPI: {
      getContactAvailabilityAPI: {
        key: () => ["appointmentCalendarsAPI", "getContactAvailabilityAPI"],
      },
    },
  },
}))

const { useInvalidateAppointments } = await import(
  "../use-invalidate-appointments"
)

describe("useInvalidateAppointments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.invalidateQueries.mockResolvedValue(undefined)
  })

  test("refetches the appointment list now", async () => {
    await useInvalidateAppointments()()

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["appointmentsAPI"],
    })
  })

  test("only marks availability stale so an open dialog does not refetch it", async () => {
    await useInvalidateAppointments()()

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["appointmentCalendarsAPI", "getContactAvailabilityAPI"],
      refetchType: "none",
    })
  })
})
