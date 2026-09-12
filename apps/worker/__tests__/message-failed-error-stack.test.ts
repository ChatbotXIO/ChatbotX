import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = join(import.meta.dirname, "..", "src")

// The call, not the enum member: `listener.ts` uses the same member as an
// object key to register its handlers, and that is not an emit site.
const EMIT = 'emit(messageEventTypeSchema.enum["message:failed"],'

/**
 * `message:failed` emitters with no local throw to capture frames from. The
 * provider decided this send failed long after it left this worker, so there is
 * no stack anywhere in this process that points at the failure — `NULL` is the
 * honest value, and synthesising one would put the consumer loop in every row.
 */
const NO_LOCAL_THROW = new Set(["integration/handlers/message-status.ts"])

/** Every `.ts` under `src`, recursively — same walk as `rpc-router-auth-surface`. */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name))

/** The object literal passed as `emit`'s second argument, by brace matching. */
const emitPayloads = (source: string): string[] => {
  const payloads: string[] = []
  let cursor = source.indexOf(EMIT)
  while (cursor !== -1) {
    const open = source.indexOf("{", cursor + EMIT.length)
    let depth = 0
    let index = open
    while (index < source.length) {
      if (source[index] === "{") {
        depth++
      } else if (source[index] === "}") {
        depth--
        if (depth === 0) {
          break
        }
      }
      index++
    }
    payloads.push(source.slice(open, index + 1))
    cursor = source.indexOf(EMIT, index)
  }
  return payloads
}

const emitSites = walk(SRC)
  .map((path) => ({
    relative: path.slice(SRC.length + 1),
    payloads: emitPayloads(readFileSync(path, "utf8")),
  }))
  .filter(({ payloads }) => payloads.length > 0)

/**
 * `ErrorLog.stackTrace` is only ever populated on the outbound-send path by the
 * emitter: `recordProviderErrorLog` reads a `ParsedError` off a Redis stream,
 * which has no `stack` and never did. An emit site that forgets `errorStack`
 * therefore writes a stackless row and nothing fails — which is exactly how the
 * column came to be `NULL` for every send failure before this test existed.
 */
describe("message:failed emitters", () => {
  it("finds every emit site, so the assertions below cannot pass vacuously", () => {
    expect(emitSites.length).toBeGreaterThanOrEqual(5)
    expect(emitSites.map(({ relative }) => relative)).toContain(
      "chat/handlers/send-message.ts",
    )
  })

  it.each(emitSites)("$relative captures the thrown stack", ({
    relative,
    payloads,
  }) => {
    for (const payload of payloads) {
      expect(
        NO_LOCAL_THROW.has(relative) || payload.includes("errorStack"),
        `${relative} emits message:failed without errorStack`,
      ).toBe(true)
    }
  })
})
