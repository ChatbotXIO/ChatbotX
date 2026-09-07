import { DEFAULT_API_VERSION } from "../constants"
import { logger } from "../lib/logger"
import { getSharedWabaTargetIds } from "./auth"
import {
  listPhoneNumbers,
  PHONE_NUMBER_LIST_COEXIST_FIELDS,
  type WhatsappPhoneNumber,
} from "./phone-number"
import {
  classifyTarget,
  type ProbeContext,
  probeBucket,
  type TargetCandidate,
} from "./waba-targets"

/** One connectable WhatsApp Business app number, and the WABA it goes through. */
export type BusinessAppCandidate = {
  wabaId: string
  /** The WABA node's `owner_business_info.id`; `""` when Graph omits it. */
  businessId: string
  phoneNumber: WhatsappPhoneNumber
}

export type ResolveBusinessAppCandidatesProps = {
  accessToken: string
  appAccessToken: string
  version?: string
  /**
   * The app's system user and its token — exactly what `addSystemUser` posts
   * with. Only used to break a twin-WABA tie; without both, the tie falls back
   * to Meta's target order.
   */
  systemUserToken?: string
  systemUserId?: string
}

/** A real WABA plus the Business App numbers it lists. */
type WabaBusinessAppNumbers = {
  candidate: TargetCandidate
  phoneNumbers: WhatsappPhoneNumber[]
}

/**
 * Business App numbers on one WABA, or none when Graph refuses the listing —
 * one unusable target must never sink an otherwise connectable login.
 */
async function listBusinessAppPhoneNumbers(props: {
  wabaId: string
  accessToken: string
  version: string
}): Promise<WhatsappPhoneNumber[]> {
  try {
    const response = await listPhoneNumbers({
      wabaId: props.wabaId,
      accessToken: props.accessToken,
      version: props.version,
      fields: PHONE_NUMBER_LIST_COEXIST_FIELDS,
    })

    return response.data.filter(
      (phoneNumber) => phoneNumber.is_on_biz_app === true,
    )
  } catch (error) {
    logger.warn(
      { err: error, wabaId: props.wabaId },
      "WhatsApp granted target did not list phone numbers, skipping it",
    )
    return []
  }
}

/**
 * Every WABA that lists a given number, in Meta's target order. A coexistence
 * onboarding creates a real WABA and a shadow twin holding the same number, so
 * this is routinely two entries for one phone id.
 */
function groupOwnersByPhoneNumberId(
  listings: WabaBusinessAppNumbers[],
): Map<string, TargetCandidate[]> {
  const owners = new Map<string, TargetCandidate[]>()

  for (const listing of listings) {
    for (const phoneNumber of listing.phoneNumbers) {
      owners.set(phoneNumber.id, [
        ...(owners.get(phoneNumber.id) ?? []),
        listing.candidate,
      ])
    }
  }

  return owners
}

/**
 * Which WABA a number connects through. A single owner needs no probe; twins
 * are decided by the assignment that would otherwise fail at connect time, and
 * a number every twin rejects is dropped rather than offered.
 */
async function resolveOwnerForPhoneNumber(
  owners: TargetCandidate[],
  context: ProbeContext,
): Promise<TargetCandidate | null> {
  if (owners.length <= 1) {
    return owners[0] ?? null
  }

  const { pickedTargetId } = await probeBucket(owners, context)
  return owners.find((owner) => owner.targetId === pickedTargetId) ?? null
}

/** Meta's target order, and each WABA's own listing order within it. */
async function collectCandidates(
  listings: WabaBusinessAppNumbers[],
  context: ProbeContext,
): Promise<BusinessAppCandidate[]> {
  const ownersByPhoneNumberId = groupOwnersByPhoneNumberId(listings)
  const resolved = new Map<string, TargetCandidate | null>()

  for (const [phoneNumberId, owners] of ownersByPhoneNumberId) {
    resolved.set(
      phoneNumberId,
      await resolveOwnerForPhoneNumber(owners, context),
    )
  }

  const candidates: BusinessAppCandidate[] = []
  const emitted = new Set<string>()

  for (const listing of listings) {
    for (const phoneNumber of listing.phoneNumbers) {
      const owner = resolved.get(phoneNumber.id)
      if (
        !owner ||
        owner !== listing.candidate ||
        emitted.has(phoneNumber.id)
      ) {
        continue
      }
      emitted.add(phoneNumber.id)
      candidates.push({
        wabaId: owner.targetId,
        businessId: owner.businessId ?? "",
        phoneNumber,
      })
    }
  }

  return candidates
}

/**
 * Resolve the WhatsApp Business app ("coexistence") numbers an access token
 * can connect, each paired with the WABA that number actually connects
 * through.
 *
 * The mode the operator picked — "Connect a WhatsApp Business App" — is the
 * only thing that says a Business App number was onboarded this login: an
 * Embedded Signup token carries EVERY WABA the user ever granted the app, and
 * Meta exposes no field naming the one chosen this time. So instead of
 * guessing a single WABA, this asks the question the mode actually implies:
 * which numbers across all granted WABAs are live on the WhatsApp Business app
 * (`is_on_biz_app`)? WABAs holding only Cloud API numbers drop out on their
 * own, and each coexistence onboarding's real/shadow WABA pair collapses to
 * one usable target through the same `assigned_users` probe
 * `resolveOwningWabaId` uses.
 *
 * Numbers already connected elsewhere are NOT filtered here: the connected set
 * can only be read once the ids are known, so the caller drops them from the
 * returned candidates (`partitionAvailablePhoneNumbers` in the builder).
 *
 * Graph calls: one `debug_token`, one introspection per granted target, one
 * phone-number listing per real WABA, and one assignment attempt per twin —
 * never for a number a single WABA owns.
 */
/** One granted target with the Business App numbers it lists (empty for non-WABAs). */
function listBusinessAppNumbersPerWaba(
  classifications: TargetCandidate[],
  auth: { accessToken: string; version: string },
): Promise<WabaBusinessAppNumbers[]> {
  return Promise.all(
    classifications
      .filter((candidate) => candidate.isWaba)
      .map(async (candidate) => ({
        candidate,
        phoneNumbers: await listBusinessAppPhoneNumbers({
          wabaId: candidate.targetId,
          ...auth,
        }),
      })),
  )
}

/**
 * Not a warning: a login whose granted WABAs simply hold no WhatsApp Business
 * app number is an ordinary user situation (the operator picked the
 * coexistence mode but never onboarded a number), and the builder already
 * answers it with `NO_PHONE_NUMBER_CANDIDATES`.
 */
function logNoCandidate(classifications: TargetCandidate[]): void {
  logger.info(
    {
      candidates: classifications.map((candidate) => ({
        targetId: candidate.targetId,
        nodeType: candidate.nodeType,
        isWaba: candidate.isWaba,
      })),
      reason: "noBusinessAppPhoneNumberCandidate",
    },
    "No unconnected Business App phone number among the granted targets",
  )
}

export async function resolveBusinessAppCandidates(
  props: ResolveBusinessAppCandidatesProps,
): Promise<BusinessAppCandidate[]> {
  const { version = DEFAULT_API_VERSION, accessToken } = props
  const targetIds = await getSharedWabaTargetIds(
    accessToken,
    props.appAccessToken,
  )
  if (targetIds.length === 0) {
    return []
  }

  const classifications = await Promise.all(
    targetIds.map((targetId) =>
      classifyTarget({ targetId, accessToken, version }),
    ),
  )
  const listings = await listBusinessAppNumbersPerWaba(classifications, {
    accessToken,
    version,
  })
  const candidates = await collectCandidates(listings, {
    version,
    systemUserToken: props.systemUserToken,
    systemUserId: props.systemUserId,
  })

  if (candidates.length === 0) {
    logNoCandidate(classifications)
  }

  return candidates
}
