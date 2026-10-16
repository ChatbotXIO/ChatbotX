import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

/**
 * `callback.ts` cannot be imported here (it pulls in `next/headers` and the whole
 * business layer), so — like `marketing-messages-callback-state.test.ts` — this
 * pins the wiring contract by reading the source. The behavior behind each branch
 * is covered by `meta-capi-oauth-callback.test.ts`.
 */
const source = readFileSync(
  join(process.cwd(), "src/app/integrations/[...integration]/callback.ts"),
  "utf8",
)

const indexOfOrFail = (needle: string, from = 0): number => {
  const index = source.indexOf(needle, from)
  expect(index, `callback.ts must contain: ${needle}`).toBeGreaterThanOrEqual(0)
  return index
}

describe("callback route — metaCapi flow", () => {
  test("declares the flow and its state fields", () => {
    expect(source).toContain('"metaCapi"')
    expect(source).toContain("capiChannel: z.enum(CAPI_OAUTH_CHANNELS)")
    expect(source).toContain("capiIntegrationId: zodBigintAsString()")
    expect(source).toContain("nonce: z.string().min(1)")
  })

  test("serves the messenger flow before the reconnect branch", () => {
    const messengerCase = indexOfOrFail('case "messenger": {')
    const capiBranch = indexOfOrFail(
      'stateParams.flow === "metaCapi"',
      messengerCase,
    )
    const reconnectBranch = indexOfOrFail(
      "reconnectMessengerHandler({",
      messengerCase,
    )

    expect(capiBranch).toBeLessThan(reconnectBranch)
    expect(source.slice(capiBranch, reconnectBranch)).toContain(
      'channel: "messenger"',
    )
  })

  test("serves the instagram flow before the missing-reconnect bail-out", () => {
    const instagramCase = indexOfOrFail('case "instagramFacebook": {')
    const capiBranch = indexOfOrFail(
      'stateParams.flow === "metaCapi"',
      instagramCase,
    )
    const bailOut = indexOfOrFail(
      "if (!stateParams.reconnectIntegrationId) {",
      instagramCase,
    )

    expect(capiBranch).toBeLessThan(bailOut)
    expect(source.slice(capiBranch, bailOut)).toContain('channel: "instagram"')
  })

  test("hands the outcome to the shared redirect, never trusting state beyond the handler", () => {
    expect(source.match(/completeMetaCapiConnect\(/g)).toHaveLength(2)
    expect(source).toContain("redirectWithMetaCapiOutcome(")
  })

  test("never lets a metaCapi state without a workspace reach the create-workspace branch", () => {
    const guard = indexOfOrFail("create-workspace branch below would run")
    const createWorkspace = indexOfOrFail("createFirstWorkspace(userId)", guard)

    expect(source.slice(guard, createWorkspace)).toContain(
      'stateParams.flow === "metaCapi"',
    )
  })

  test("reports a cancelled dialog back on the Ads tab", () => {
    const cancelBlock = indexOfOrFail("Facebook returns ?error=access_denied")
    const capiCancel = indexOfOrFail(
      'stateParams.flow === "metaCapi"',
      cancelBlock,
    )

    expect(source.slice(capiCancel, capiCancel + 250)).toContain(
      'reason: "cancelled"',
    )
  })
})
