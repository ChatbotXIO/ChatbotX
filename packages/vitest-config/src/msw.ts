import { setupServer } from "msw/node"

/**
 * Shared MSW server instance — lifecycle only, **no default handlers**.
 *
 * Each integration that mocks an upstream HTTP API owns its own handler
 * module and ships it as a `./test-handlers` export. Tests opt-in:
 *
 *     import { server, http, HttpResponse } from "@chatbotx.io/vitest-config/msw"
 *     import { testHandlers } from "@chatbotx.io/integration-telegram/test-handlers"
 *
 *     beforeAll(() => server.use(...testHandlers))
 *
 * Per-test overrides still work via `server.use(http.post(...))`. Handlers are
 * reset between tests by `./setup-msw.ts`.
 *
 * `onUnhandledRequest: "error"` (set in setup-msw.ts) means any outbound HTTP
 * call without an explicit handler fails the test — no silent network leaks.
 */
export const server = setupServer()

export { bypass, delay, HttpResponse, http, passthrough } from "msw"
