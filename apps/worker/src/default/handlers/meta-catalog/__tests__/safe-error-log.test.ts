import { MetaCatalogException } from "@chatbotx.io/integration-meta-catalog"
import { describe, expect, test } from "vitest"
import { safeMetaCatalogErrorLog } from "../safe-error-log"

describe("safeMetaCatalogErrorLog", () => {
  test("redacts upstream credentials while retaining non-secret Graph metadata", () => {
    const error = new MetaCatalogException(
      'Rejected {"access_token":"SECRET"}\nclient_secret=OTHER authorization: Basic dXNlcjpwYXNz',
      401,
      190,
      {
        graphSubcode: 463,
        fbTraceId: "trace-1",
      },
    )

    const safeLog = safeMetaCatalogErrorLog(error, "Meta request failed")

    expect(safeLog).toEqual({
      details: {
        err: expect.objectContaining({
          message:
            'Rejected {"access_token":"[REDACTED]"} client_secret=[REDACTED] Authorization: [REDACTED] (code 190)',
          name: "MetaCatalogException",
        }),
        error:
          'Rejected {"access_token":"[REDACTED]"} client_secret=[REDACTED] Authorization: [REDACTED] (code 190)',
        errorType: "MetaCatalogException",
        fbTraceId: "trace-1",
        graphCode: 190,
        graphSubcode: 463,
        statusCode: 401,
      },
      message:
        'Rejected {"access_token":"[REDACTED]"} client_secret=[REDACTED] Authorization: [REDACTED] (code 190)',
    })
    expect(safeLog.details.err?.stack).not.toContain("SECRET")
    expect(safeLog.details.err?.stack).not.toContain("OTHER")
    expect(safeLog.details.err?.stack).not.toContain("dXNlcjpwYXNz")
  })

  test("does not log an untrusted error message or stack", () => {
    const error = new Error("postgres://admin:password@database.internal")

    expect(safeMetaCatalogErrorLog(error, "Meta request failed")).toEqual({
      details: {
        error: "Meta request failed",
        errorType: "Error",
      },
      message: "Meta request failed",
    })
  })
})
