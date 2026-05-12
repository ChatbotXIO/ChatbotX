import { afterAll, afterEach, beforeAll } from "vitest"
import { server } from "./msw"

/**
 * Boot the MSW server before any test runs, reset handlers between tests so
 * per-test overrides do not leak, and close the server when the suite exits.
 *
 * `onUnhandledRequest: "error"` is deliberate: any outbound HTTP call that a
 * test does not explicitly mock will fail. This prevents accidental real
 * network traffic during tests.
 */

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
