import { describe, expect, test } from "vitest"
import { redactErrSerializer, scrubLogArgs } from "../src/index"

const TOKEN = "EAABsecret1234567890"
const REFRESH_URL = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${TOKEN}`

describe("redactErrSerializer", () => {
  test("scrubs a token embedded in an error message and stack", () => {
    const error = new Error(`Request to ${REFRESH_URL} failed`)

    const serialized = JSON.stringify(redactErrSerializer(error))

    expect(serialized).not.toContain(TOKEN)
    expect(serialized).toContain("access_token=[redacted]")
  })

  test("scrubs a token on a nested originError captured by an HTTP client", () => {
    const error = Object.assign(new Error("auth refresh failed"), {
      // Mirrors an AuthRefreshException carrying the raw refresh error.
      originError: Object.assign(new Error(`GET ${REFRESH_URL}`), {
        request: { url: REFRESH_URL },
      }),
    })

    const serialized = JSON.stringify(redactErrSerializer(error))

    expect(serialized).not.toContain(TOKEN)
  })

  test("scrubs a Facebook fb_exchange_token", () => {
    const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&fb_exchange_token=${TOKEN}`
    const serialized = JSON.stringify(
      redactErrSerializer(new Error(`refresh via ${url}`)),
    )

    expect(serialized).not.toContain(TOKEN)
  })

  test("passes an already-sanitized plain object through, still scrubbing", () => {
    const result = redactErrSerializer({
      name: "Error",
      message: `boom ${REFRESH_URL}`,
    }) as { message: string }

    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})

describe("scrubLogArgs", () => {
  test("scrubs a token in an explicit message string", () => {
    const [obj, msg] = scrubLogArgs([
      { err: new Error("x") },
      `hit ${REFRESH_URL}`,
    ])

    expect(obj).toEqual({ err: expect.any(Error) })
    expect(msg).not.toContain(TOKEN)
    expect(msg).toContain("access_token=[redacted]")
  })

  test("appends a scrubbed message when a bare Error is logged with no message", () => {
    const error = new Error(`GET ${REFRESH_URL}`)
    const result = scrubLogArgs([error])

    // pino would derive `msg` from error.message; the appended scrubbed message
    // pre-empts that so the derived msg cannot carry the token.
    expect(result[0]).toBe(error)
    expect(typeof result[1]).toBe("string")
    expect(result[1] as string).not.toContain(TOKEN)
  })

  test("appends a scrubbed message for an { err } object with no message", () => {
    const result = scrubLogArgs([{ err: new Error(`GET ${REFRESH_URL}`) }])

    expect(String(result[1])).not.toContain(TOKEN)
  })

  test("leaves a clean call untouched", () => {
    const result = scrubLogArgs([{ userId: "u-1" }, "did a thing"])

    expect(result).toEqual([{ userId: "u-1" }, "did a thing"])
  })
})
