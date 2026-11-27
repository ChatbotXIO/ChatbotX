import { vi } from "vitest"

/**
 * Shared by the suites that run real libvips encodes. Not a test file itself
 * (no `.test.` suffix), so vitest never collects it.
 *
 * Encodes on a CI runner shared with other suites are slow: a single encode
 * measured 7s under load (2026-10-29), against vitest's 30s default, so those
 * `describe` blocks take this timeout instead.
 */
export const ENCODE_TEST_TIMEOUT_MS = 120_000

/**
 * The production encode gives up after `STORED_IMAGE_ENCODE_TIMEOUT_SECONDS`
 * (2s by default) and keeps the source. On a starved runner that is exactly
 * the path an encode test takes by accident, failing an `optimized: true`
 * assertion instead of the test timing out. The settings' own test still
 * checks the default; here the encode is given the schema maximum. Pair with
 * `afterEach(() => vi.unstubAllEnvs())`.
 */
export const stubGenerousEncodeTimeout = (): void => {
  vi.stubEnv("STORED_IMAGE_ENCODE_TIMEOUT_SECONDS", "60")
}
