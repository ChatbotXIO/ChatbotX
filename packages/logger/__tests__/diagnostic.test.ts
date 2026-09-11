import pino from "pino"
import { afterEach, describe, expect, test, vi } from "vitest"
import { resolveDiagnosticLevel } from "../src/index"

describe("resolveDiagnosticLevel", () => {
  test("returns info when LOG_DEBUG is exactly 'true'", () => {
    expect(resolveDiagnosticLevel({ LOG_DEBUG: "true" })).toBe("info")
  })

  test("returns debug when LOG_DEBUG is 'false'", () => {
    expect(resolveDiagnosticLevel({ LOG_DEBUG: "false" })).toBe("debug")
  })

  test("returns debug when LOG_DEBUG is unset", () => {
    expect(resolveDiagnosticLevel({})).toBe("debug")
  })

  test("returns debug when LOG_DEBUG is '1'", () => {
    expect(resolveDiagnosticLevel({ LOG_DEBUG: "1" })).toBe("debug")
  })

  test("returns debug when LOG_DEBUG is 'TRUE' (strict match only)", () => {
    expect(resolveDiagnosticLevel({ LOG_DEBUG: "TRUE" })).toBe("debug")
  })
})

describe("logDiagnostic", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // `diagnosticLevel` is fixed at module load, so each test imports a fresh
  // module with LOG_DEBUG stubbed — making the branch deterministic regardless
  // of the developer's shell environment.
  const loadLogDiagnostic = async (logDebug: string) => {
    vi.resetModules()
    vi.stubEnv("LOG_DEBUG", logDebug)
    const module = await import("../src/index")
    return module.logDiagnostic
  }

  const createCaptureLogger = (level: "debug" | "info") => {
    const lines: Record<string, unknown>[] = []
    const logger = pino(
      { level },
      {
        write: (line: string) => {
          lines.push(JSON.parse(line))
        },
      },
    )
    return { lines, logger }
  }

  test("emits at debug by default (LOG_DEBUG unset)", async () => {
    const logDiagnostic = await loadLogDiagnostic("")
    const { lines, logger } = createCaptureLogger("debug")

    logDiagnostic(logger, () => ({ foo: "bar" }), "diagnostic message")

    expect(lines).toHaveLength(1)
    // pino level 20 === debug: proves the default (unpromoted) path.
    expect(lines[0]).toMatchObject({
      level: 20,
      foo: "bar",
      msg: "diagnostic message",
    })
  })

  test("promotes to info when LOG_DEBUG=true, surviving an info-level logger", async () => {
    const logDiagnostic = await loadLogDiagnostic("true")
    const { lines, logger } = createCaptureLogger("info")

    logDiagnostic(logger, () => ({ foo: "bar" }), "diagnostic message")

    expect(lines).toHaveLength(1)
    // pino level 30 === info: proves the debug→info promotion path is live.
    expect(lines[0]).toMatchObject({ level: 30, msg: "diagnostic message" })
  })

  test("does not invoke buildData when the resolved level is disabled", async () => {
    // LOG_DEBUG unset ⇒ diagnostic level 'debug', which an 'info' logger drops.
    const logDiagnostic = await loadLogDiagnostic("")
    const { lines, logger } = createCaptureLogger("info")
    const buildData = vi.fn(() => ({ foo: "bar" }))

    logDiagnostic(logger, buildData, "diagnostic message")

    expect(buildData).not.toHaveBeenCalled()
    expect(lines).toHaveLength(0)
  })
})
