import ky from "ky"
import { API_URL } from "../constants"
import { parseOriginError, rescue } from "../exception"
import { logger } from "../lib/logger"

/**
 * The pieces both WABA resolvers share: how a granted `whatsapp_business_management`
 * target is classified as a real WABA, and how a real WABA is told apart from
 * the coexistence "WhatsApp account" node that shadows it.
 *
 * `waba-owner.ts` uses them to pick the single WABA owning a login's numbers;
 * `waba-candidates.ts` uses them to pick, per Business App number, the twin
 * that number actually connects through.
 */

/** Graph's introspection type for a real WhatsApp Business Account node. */
const WABA_NODE_TYPE = "whatsapp_business_account"

/** `metadata=1` asks Graph to describe the node instead of only its fields. */
const NODE_PROBE_SEARCH_PARAMS = {
  metadata: "1",
  fields: "id,owner_business_info",
} as const

/**
 * Graph's refusal when a WABA-level Business Management edge is aimed at a
 * coexistence "WhatsApp account" node: `code 100 / subcode 2388339`,
 * "WhatsApp accounts cannot be used with this API".
 */
const WHATSAPP_ACCOUNT_MISUSE_SUBCODE = 2_388_339
const WHATSAPP_ACCOUNT_MISUSE_USER_TITLE = "Invalid WhatsApp account usage"

const TARGET_CAPABILITIES = {
  USABLE: "usable",
  REJECTED: "rejected",
  UNKNOWN: "unknown",
} as const

type TargetCapability =
  (typeof TARGET_CAPABILITIES)[keyof typeof TARGET_CAPABILITIES]

type WabaNodeProbeResponse = {
  id?: string
  metadata?: { type?: string }
  owner_business_info?: { id?: string }
}

/** What every step learned about one granted target, and what the logs show. */
export type TargetCandidate = {
  targetId: string
  nodeType?: string
  businessId?: string
  isWaba: boolean
  score?: number
  capability?: TargetCapability
}

/**
 * Everything the capability probe needs. The app's system user and its token
 * are exactly what `addSystemUser` posts with; without both, a target can only
 * ever come back `unknown`.
 */
export type ProbeContext = {
  version: string
  systemUserToken?: string
  systemUserId?: string
}

function toLogEntry(candidate: TargetCandidate) {
  return {
    targetId: candidate.targetId,
    nodeType: candidate.nodeType,
    hasOwnerBusinessInfo: Boolean(candidate.businessId),
    isWaba: candidate.isWaba,
    score: candidate.score,
    capability: candidate.capability,
  }
}

/** Every branch that gives up says which targets it saw and why it rejected them. */
export function warnUnresolved(
  candidates: TargetCandidate[],
  reason: string,
): null {
  logger.warn(
    { candidates: candidates.map(toLogEntry), reason },
    "No granted target resolved to an owning WhatsApp Business Account",
  )
  return null
}

/**
 * Classifies one `whatsapp_business_management` target as a real WABA.
 *
 * Embedded Signup can grant several targets, and Meta lists the coexistence
 * "WhatsApp account" node alongside the WABA that owns the same numbers — both
 * answer `/{id}/phone_numbers` identically, so phone ownership alone cannot
 * tell them apart. `metadata=1` is Graph's introspection flag: it adds
 * `metadata.type` to the node, which reads `whatsapp_business_account` for a
 * WABA. `owner_business_info` rides along in the same request as the fallback
 * signal for a node Graph answers without a `metadata` block — and as the
 * `business` argument the capability probe needs — so a target always costs
 * exactly one Graph call here.
 *
 * Any error means "not this one" rather than a throw: one odd target must not
 * break an otherwise connectable login.
 */
export async function classifyTarget(props: {
  targetId: string
  accessToken: string
  version: string
}): Promise<TargetCandidate> {
  const { targetId } = props

  try {
    const result = await rescue(() =>
      ky
        .get<WabaNodeProbeResponse>(`${API_URL}/${props.version}/${targetId}`, {
          searchParams: { ...NODE_PROBE_SEARCH_PARAMS },
          headers: { Authorization: `Bearer ${props.accessToken}` },
        })
        .json(),
    )

    const nodeType = result.metadata?.type
    const businessId = result.owner_business_info?.id
    const isWaba = nodeType ? nodeType === WABA_NODE_TYPE : Boolean(businessId)

    return { targetId, nodeType, businessId, isWaba }
  } catch (error) {
    logger.warn(
      { err: error, targetId },
      "WhatsApp granted target could not be classified, treating it as not a WABA",
    )
    return { targetId, isWaba: false }
  }
}

function isWhatsappAccountMisuse(error: unknown): boolean {
  const parsed = parseOriginError(error)
  return (
    Number(parsed.subCode) === WHATSAPP_ACCOUNT_MISUSE_SUBCODE ||
    parsed.userTitle === WHATSAPP_ACCOUNT_MISUSE_USER_TITLE
  )
}

/** The assignment `addSystemUser` performs, in the same shape and on the same timeout. */
const SYSTEM_USER_TASKS = "MANAGE"
const SYSTEM_USER_ASSIGNMENT_TIMEOUT_MS = 60_000

function canProbe(context: ProbeContext): boolean {
  return Boolean(context.systemUserToken && context.systemUserId)
}

/**
 * Performs the exact write the connect later fails on.
 *
 * Every read Graph offers answers identically for a WABA and for the
 * coexistence node that shadows it — same `owner_business_info`, same
 * `/phone_numbers`, and even `GET /{id}/assigned_users` is a 200 on both
 * (verified live). The only call that tells them apart is the assignment
 * itself: `POST /{id}/assigned_users` is refused with subcode 2388339 on the
 * shadow node and accepted on the WABA. Performing it here is not an extra
 * side effect — `addSystemUser` repeats the same idempotent assignment on the
 * chosen WABA during every connect.
 *
 * A 2xx means usable; the WhatsApp-account refusal means rejected; anything
 * else — an expired token, a throttle, a permission gap — is unknown and keeps
 * the candidate, so a transient failure never hands the connect to the wrong
 * WABA.
 */
async function probeCapability(
  candidate: TargetCandidate,
  context: ProbeContext,
): Promise<TargetCapability> {
  if (!canProbe(context)) {
    return TARGET_CAPABILITIES.UNKNOWN
  }

  try {
    // Not parsed: `addSystemUser` ignores the body too, and an empty 2xx body
    // must not be mistaken for an undecided probe.
    await ky.post(
      `${API_URL}/${context.version}/${candidate.targetId}/assigned_users`,
      {
        searchParams: {
          user: context.systemUserId ?? "",
          tasks: SYSTEM_USER_TASKS,
        },
        headers: { Authorization: `Bearer ${context.systemUserToken}` },
        timeout: SYSTEM_USER_ASSIGNMENT_TIMEOUT_MS,
      },
    )

    return TARGET_CAPABILITIES.USABLE
  } catch (error) {
    if (isWhatsappAccountMisuse(error)) {
      logger.warn(
        { targetId: candidate.targetId },
        "WhatsApp granted target rejects WABA-level API use, excluding it",
      )
      return TARGET_CAPABILITIES.REJECTED
    }

    logger.warn(
      { err: error, targetId: candidate.targetId },
      "WhatsApp capability probe failed for an unrelated reason, keeping the target",
    )
    return TARGET_CAPABILITIES.UNKNOWN
  }
}

type BucketOutcome = {
  pickedTargetId: string | null
  results: TargetCandidate[]
}

/**
 * Probes one bucket of equally-ranked candidates in Meta order and stops at
 * the first accepted one, so the system user is never assigned to more WABAs
 * than the connect needs. A bucket with no accepted candidate still yields one
 * whose probe failed for an unrelated reason — the connect repeats the
 * assignment and surfaces the real error — and only an all-rejected bucket
 * yields nothing.
 */
export async function probeBucket(
  bucket: TargetCandidate[],
  context: ProbeContext,
): Promise<BucketOutcome> {
  const results: TargetCandidate[] = []

  // Meta's order is the user's choice; the probe exists only to step over a
  // shadow twin. The first target that is not positively rejected wins — an
  // undecided probe (throttle, expired token) must not hand the connect to
  // a later target the user did not pick.
  for (const candidate of bucket) {
    const capability = await probeCapability(candidate, context)
    results.push({ ...candidate, capability })
    if (capability === TARGET_CAPABILITIES.REJECTED) {
      continue
    }
    if (capability === TARGET_CAPABILITIES.UNKNOWN && canProbe(context)) {
      logger.warn(
        {
          candidates: results.map(toLogEntry),
          pickedTargetId: candidate.targetId,
        },
        "WhatsApp system-user assignment could not be decided for this target, keeping it as the user's choice",
      )
    }
    return { pickedTargetId: candidate.targetId, results }
  }

  return { pickedTargetId: null, results }
}
