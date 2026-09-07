import type { WhatsappCredential } from "@chatbotx.io/database/partials"
import { appAccessToken } from "@chatbotx.io/integration-whatsapp/api/auth"
import {
  type BusinessAppCandidate,
  resolveBusinessAppCandidates,
} from "@chatbotx.io/integration-whatsapp/api/waba-candidates"
import { logger } from "@/lib/log"
import {
  CONNECT_WHATSAPP_RESULT_TYPES,
  type ConnectWhatsappResult,
  type ConnectWhatsappSchema,
} from "../schema"
import {
  createUnavailablePhoneNumberResult,
  type PreparedConnectInput,
  partitionAvailablePhoneNumbers,
  toDirectInput,
  toShortCircuit,
} from "./prepare-connect-shared"

type PrepareBusinessAppInputParams = {
  input: ConnectWhatsappSchema
  whatsappSettings: WhatsappCredential
  accessToken: string
  version: string
}

/**
 * Records every Business App number the token offered — the ones still
 * connectable AND the ones dropped because they are already connected — and
 * which one was taken. Meta gives no field naming the number onboarded this
 * login, so if a connect ever lands on the wrong number this line is the only
 * way to see what the alternatives were and in which order Meta listed them.
 */
function logCandidateChoice(
  candidates: BusinessAppCandidate[],
  available: BusinessAppCandidate[],
  picked: BusinessAppCandidate,
): void {
  const availableIds = new Set(
    available.map((candidate) => candidate.phoneNumber.id),
  )
  logger.info(
    {
      candidates: candidates.map((candidate) => ({
        phoneNumberId: candidate.phoneNumber.id,
        wabaId: candidate.wabaId,
        alreadyConnected: !availableIds.has(candidate.phoneNumber.id),
      })),
      picked: { phoneNumberId: picked.phoneNumber.id, wabaId: picked.wabaId },
    },
    "[wa-connect] picked the first connectable Business App number in Meta target order",
  )
}

/**
 * Drops the numbers already connected elsewhere, keeping Meta's target order
 * so `[0]` stays "the first number this login can still connect".
 *
 * The connected set can only be read once the ids are known, so this happens
 * here rather than inside `resolveBusinessAppCandidates`. It also decides
 * which of the two "nothing to connect" answers the operator sees: none
 * offered at all, or every one of them already taken.
 */
async function selectConnectable(
  candidates: BusinessAppCandidate[],
): Promise<
  | { available: BusinessAppCandidate[] }
  | { shortCircuit: ConnectWhatsappResult }
> {
  const availability = await partitionAvailablePhoneNumbers(
    candidates.map((candidate) => candidate.phoneNumber),
  )
  const unavailable = createUnavailablePhoneNumberResult(availability.reason)
  if (unavailable) {
    return { shortCircuit: unavailable }
  }

  const availableIds = new Set(
    availability.phoneNumbers.map((phoneNumber) => phoneNumber.id),
  )
  return {
    available: candidates.filter((candidate) =>
      availableIds.has(candidate.phoneNumber.id),
    ),
  }
}

/**
 * The coexistence ("Connect a WhatsApp Business App") path: connect the number
 * this login just onboarded, and only that one.
 *
 * Every other OAuth path resolves ONE owning WABA and lists its numbers. That
 * is wrong here — an Embedded Signup token carries every WABA the user ever
 * granted the app, cumulatively, and each coexistence onboarding mints a brand
 * new WABA (plus a shadow twin) for the single number it onboarded, so scoring
 * WABAs by how many numbers they hold lands on the operator's biggest Cloud
 * API account instead. `resolveBusinessAppCandidates` asks the question the
 * mode actually implies: which numbers, across every granted WABA, are live on
 * the WhatsApp Business app?
 *
 * Among those, the number onboarded THIS login is always the first in Meta's
 * target order (verified against three live logins), and Meta only permits the
 * history sync once, within 24 hours of onboarding — so the older Business App
 * numbers further down the list are not connectable in any useful sense.
 * Offering them in a picker would invite the operator to pick a number whose
 * sync window has closed. Hence: no picker, no signup session, just the first
 * still-unconnected candidate, with its OWN WABA and business id.
 */
export async function prepareBusinessAppInput(
  params: PrepareBusinessAppInputParams,
): Promise<PreparedConnectInput> {
  const { whatsappSettings, accessToken, version } = params

  const candidates = await resolveBusinessAppCandidates({
    accessToken,
    appAccessToken: appAccessToken(whatsappSettings),
    version,
    systemUserToken: whatsappSettings.systemUserToken,
    systemUserId: whatsappSettings.systemUserId,
  })

  const connectable = await selectConnectable(candidates)
  if ("shortCircuit" in connectable) {
    return toShortCircuit(connectable.shortCircuit)
  }

  const { available } = connectable
  const [picked] = available
  if (!picked) {
    // Unreachable: `partitionAvailablePhoneNumbers` already short-circuited an
    // empty list, and `available` is that same set. Kept so the array access
    // can never be `undefined`.
    return toShortCircuit({
      type: CONNECT_WHATSAPP_RESULT_TYPES.NO_PHONE_NUMBER_CANDIDATES,
    })
  }

  logCandidateChoice(candidates, available, picked)

  return toDirectInput({
    accessToken,
    wabaId: picked.wabaId,
    businessId: picked.businessId,
    phoneNumber: picked.phoneNumber,
    workspaceId: params.input.workspaceId || null,
  })
}
