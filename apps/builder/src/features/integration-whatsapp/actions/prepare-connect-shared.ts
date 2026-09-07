import { integrationWhatsappService } from "@chatbotx.io/business"
import {
  type WhatsappPhoneNumber,
  listPhoneNumbers as whatsappListPhoneNumbers,
} from "@chatbotx.io/integration-whatsapp/api/phone-number"
import {
  duplicatedOutcome,
  notSelectableOutcome,
} from "@/features/channel-connect/lib/connect-action-outcomes"
import {
  CONNECT_WHATSAPP_RESULT_TYPES,
  type ConnectWhatsappResult,
  type WhatsappPhoneNumberOption,
} from "../schema"

/**
 * The pieces every `prepareConnectInput` branch shares: what a prepared input
 * looks like, how a directly-named phone number is partitioned, and how a
 * pending selection is turned into a signup session.
 *
 * Split out of `prepare-connect-input.ts` so the coexistence path
 * (`prepare-business-app-input.ts`) can reuse them without either module
 * importing the other.
 */

/** Identifies the signup session a connect claims a phone number from. */
type SignupSessionIdentity = {
  id: string
  userId: string
  ownerId: string
}

export type PreparedConnectInput =
  | {
      source: "direct"
      accessToken: string
      wabaId: string
      businessId: string
      phoneNumber: WhatsappPhoneNumber
      workspaceId: string | null
      signupSession?: SignupSessionIdentity
    }
  | { source: "shortCircuit"; result: ConnectWhatsappResult }

export function toDirectInput(params: {
  accessToken: string
  wabaId: string
  businessId: string
  phoneNumber: WhatsappPhoneNumber
  workspaceId: string | null
}): PreparedConnectInput {
  return { source: "direct", ...params }
}

export function toShortCircuit(
  result: ConnectWhatsappResult,
): PreparedConnectInput {
  return { source: "shortCircuit", result }
}

function toPhoneNumberOption(
  phoneNumber: WhatsappPhoneNumber,
): WhatsappPhoneNumberOption {
  return {
    id: phoneNumber.id,
    label:
      phoneNumber.verified_name.trim() ||
      phoneNumber.display_phone_number ||
      phoneNumber.id,
    displayPhoneNumber: phoneNumber.display_phone_number,
  }
}

const PHONE_NUMBER_AVAILABILITY_REASONS = {
  NO_PHONE_NUMBERS: "noPhoneNumbers",
  ALL_CONNECTED: "allConnected",
  AVAILABLE: "available",
} as const

export type PhoneNumberAvailabilityReason =
  (typeof PHONE_NUMBER_AVAILABILITY_REASONS)[keyof typeof PHONE_NUMBER_AVAILABILITY_REASONS]

export type AvailablePhoneNumbersResult = {
  reason: PhoneNumberAvailabilityReason
  phoneNumbers: WhatsappPhoneNumber[]
  totalPhoneNumberCount: number
}

/**
 * Which of a set of candidate numbers can still be connected, and — when none
 * can — whether that is because there were none to begin with or because every
 * one of them is already connected. Both callers hand it a list they have
 * already narrowed (one WABA's phone list, or the Business App numbers across
 * every granted WABA).
 */
export async function partitionAvailablePhoneNumbers(
  phoneNumbers: WhatsappPhoneNumber[],
): Promise<AvailablePhoneNumbersResult> {
  if (phoneNumbers.length === 0) {
    return {
      reason: PHONE_NUMBER_AVAILABILITY_REASONS.NO_PHONE_NUMBERS,
      phoneNumbers: [],
      totalPhoneNumberCount: 0,
    }
  }

  const connectedPhoneNumberIds =
    await integrationWhatsappService.findConnectedPhoneNumberIds(
      phoneNumbers.map((phoneNumber) => phoneNumber.id),
    )

  const availablePhoneNumbers = phoneNumbers.filter(
    (phoneNumber) => !connectedPhoneNumberIds.has(phoneNumber.id),
  )

  if (availablePhoneNumbers.length === 0) {
    return {
      reason: PHONE_NUMBER_AVAILABILITY_REASONS.ALL_CONNECTED,
      phoneNumbers: [],
      totalPhoneNumberCount: phoneNumbers.length,
    }
  }

  return {
    reason: PHONE_NUMBER_AVAILABILITY_REASONS.AVAILABLE,
    phoneNumbers: availablePhoneNumbers,
    totalPhoneNumberCount: phoneNumbers.length,
  }
}

export async function getAvailablePhoneNumbers(params: {
  wabaId: string
  accessToken: string
  version: string
}): Promise<AvailablePhoneNumbersResult> {
  const response = await whatsappListPhoneNumbers(params)
  return partitionAvailablePhoneNumbers(response.data)
}

export function createUnavailablePhoneNumberResult(
  reason: PhoneNumberAvailabilityReason,
): ConnectWhatsappResult | null {
  switch (reason) {
    case PHONE_NUMBER_AVAILABILITY_REASONS.NO_PHONE_NUMBERS:
      return { type: CONNECT_WHATSAPP_RESULT_TYPES.NO_PHONE_NUMBER_CANDIDATES }
    case PHONE_NUMBER_AVAILABILITY_REASONS.ALL_CONNECTED:
      return {
        type: CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBERS_ALREADY_CONNECTED,
      }
    default:
      return null
  }
}

/**
 * Creates the pending phone-number selection. The caller (`connect.action.ts`)
 * already ran `assertWorkspaceConnectAccess` on `input.workspaceId` (a
 * non-session request, checked once at the top of the action before any
 * credential/provider work) — this only persists the session, it does not
 * re-check membership.
 */
export async function createPhoneNumberSelectionResult(params: {
  userId: string
  ownerId: string
  workspaceId?: string | null
  wabaId: string
  businessId: string
  accessToken: string
  version: string
  candidates: WhatsappPhoneNumber[]
}): Promise<ConnectWhatsappResult> {
  const signupSession = await integrationWhatsappService.createSignupSession({
    userId: params.userId,
    ownerId: params.ownerId,
    workspaceId: params.workspaceId,
    wabaId: params.wabaId,
    businessId: params.businessId,
    accessToken: params.accessToken,
    apiVersion: params.version,
    candidatePhoneNumberIds: params.candidates.map(
      (phoneNumber) => phoneNumber.id,
    ),
  })

  return {
    type: CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBER_SELECTION,
    signupSessionId: signupSession.id,
    phoneNumbers: params.candidates.map(toPhoneNumberOption),
  }
}

/**
 * Partitions a directly-requested phone number id (session / manual /
 * OAuth-with-id paths — never the auto-select single-number path, which
 * already filters against the connected set): a live-connected id is
 * rejected before any Meta call, then the id is checked against a freshly
 * fetched WABA phone list (no cache, plan §4.9) — unknown to the WABA is
 * `notSelectable` too.
 */
export async function partitionDirectPhoneNumber(params: {
  wabaId: string
  phoneNumberId: string
  accessToken: string
  version: string
}): Promise<
  { phoneNumber: WhatsappPhoneNumber } | { shortCircuit: ConnectWhatsappResult }
> {
  const identity = {
    sourceId: params.phoneNumberId,
    name: params.phoneNumberId,
  }

  const connectedPhoneNumberIds =
    await integrationWhatsappService.findConnectedPhoneNumberIds([
      params.phoneNumberId,
    ])
  if (connectedPhoneNumberIds.has(params.phoneNumberId)) {
    return { shortCircuit: duplicatedOutcome(identity) }
  }

  const phoneNumbers = await whatsappListPhoneNumbers({
    wabaId: params.wabaId,
    accessToken: params.accessToken,
    version: params.version,
  })
  const phoneNumber = phoneNumbers.data.find(
    (candidate) => candidate.id === params.phoneNumberId,
  )
  if (!phoneNumber) {
    return { shortCircuit: notSelectableOutcome(identity) }
  }

  return { phoneNumber }
}
