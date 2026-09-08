import { DEFAULT_API_VERSION } from "../constants"
import { logger } from "../lib/logger"
import { getSharedWabaTargetIds } from "./auth"
import { listPhoneNumbers } from "./phone-number"
import {
  classifyTarget,
  type ProbeContext,
  probeBucket,
  type TargetCandidate,
  warnUnresolved,
} from "./waba-targets"

type ResolverContext = ProbeContext & {
  accessToken: string
  phoneNumberIds: string[]
}

export type ResolveOwningWabaIdProps = {
  accessToken: string
  appAccessToken: string
  version?: string
  /**
   * The app's system user and its token — exactly what `addSystemUser` posts
   * with. Only used to break an ownership tie by performing that assignment;
   * without both, a tie falls back to the ownership score alone.
   */
  systemUserToken?: string
  systemUserId?: string
  /**
   * Phone number ids the request already names. When given, the WABA that owns
   * them wins; when empty, every WABA holding a number is eligible and Meta's
   * order decides — the target granted in this login is listed first.
   */
  phoneNumberIds?: string[]
}

/** Phone number ids on a WABA, or none when Graph refuses the listing. */
async function listOwnedPhoneNumberIds(props: {
  wabaId: string
  accessToken: string
  version: string
}): Promise<string[]> {
  try {
    const response = await listPhoneNumbers(props)
    return response.data.map((phoneNumber) => phoneNumber.id)
  } catch (error) {
    logger.warn(
      { err: error, wabaId: props.wabaId },
      "WhatsApp granted target did not list phone numbers, skipping it",
    )
    return []
  }
}

/**
 * How well a WABA matches the request: the number of named phone numbers it
 * owns. When the request names none, every WABA holding at least one number
 * scores alike, so Meta's target order — which lists the account granted in
 * this login first (verified live) — decides, exactly as the pre-resolver
 * `target_ids[0]` rule did; the probe below only removes a shadow twin.
 */
function scoreOwnership(ownedIds: string[], requestedIds: string[]): number {
  if (requestedIds.length === 0) {
    return ownedIds.length > 0 ? 1 : 0
  }

  return requestedIds.filter((id) => ownedIds.includes(id)).length
}

/** Candidates bucketed by ownership score, best score first, Meta order within. */
function groupByScore(candidates: TargetCandidate[]): TargetCandidate[][] {
  const scores = [
    ...new Set(candidates.map((candidate) => candidate.score ?? 0)),
  ]
  return scores
    .sort((a, b) => b - a)
    .map((score) =>
      candidates.filter((candidate) => (candidate.score ?? 0) === score),
    )
}

/**
 * Ownership score stays the primary key: a bucket of better-matching WABAs is
 * exhausted before a worse-matching one is even probed, and within a bucket the
 * assignment decides. Only when every owning candidate is rejected does the
 * login resolve to nothing.
 */
async function pickUsableWaba(
  owners: TargetCandidate[],
  context: ResolverContext,
  all: TargetCandidate[],
): Promise<string | null> {
  let probed: TargetCandidate[] = []

  for (const bucket of groupByScore(owners)) {
    const outcome = await probeBucket(bucket, context)
    probed = [...probed, ...outcome.results]
    if (outcome.pickedTargetId) {
      return outcome.pickedTargetId
    }
  }

  return warnUnresolved(
    [...all.filter((candidate) => !owners.includes(candidate)), ...probed],
    "everyOwningTargetRejected",
  )
}

async function pickOwningWaba(
  classifications: TargetCandidate[],
  context: ResolverContext,
): Promise<string | null> {
  const scored = await Promise.all(
    classifications.map(async (candidate) => ({
      ...candidate,
      score: candidate.isWaba
        ? scoreOwnership(
            await listOwnedPhoneNumberIds({
              wabaId: candidate.targetId,
              accessToken: context.accessToken,
              version: context.version,
            }),
            context.phoneNumberIds,
          )
        : 0,
    })),
  )

  const owners = scored.filter(
    (candidate) => candidate.isWaba && candidate.score > 0,
  )
  if (owners.length === 0) {
    return warnUnresolved(scored, "noTargetOwnsTheNumbers")
  }
  if (owners.length === 1) {
    return owners[0]?.targetId ?? null
  }

  return pickUsableWaba(owners, context, scored)
}

/**
 * Resolve the WhatsApp Business Account that actually owns the numbers behind
 * an access token.
 *
 * The token's `whatsapp_business_management` grant can carry several target
 * ids, and Meta does not guarantee the WABA comes first — a coexistence
 * "WhatsApp account" node listed ahead of it introspects and lists phone
 * numbers like a WABA, so picking `target_ids[0]` stores an id every WABA-level
 * call then rejects with `code 100 / subcode 2388339`. Targets are therefore
 * narrowed in three widening-cost steps: node type, phone ownership, and — only
 * when more than one candidate still owns the numbers — the system-user
 * assignment itself, which is the call that would fail.
 *
 * Graph calls: one `debug_token`; a single granted target is returned straight
 * from it (the overwhelmingly common single-WABA login costs nothing extra),
 * otherwise one introspection per target, plus one phone-number listing per
 * WABA when at least two targets are WABAs, plus one assignment attempt per
 * candidate, in score order, until one is accepted.
 */
export async function resolveOwningWabaId(
  props: ResolveOwningWabaIdProps,
): Promise<string | null> {
  const { version = DEFAULT_API_VERSION, accessToken } = props
  const targetIds = await getSharedWabaTargetIds(
    accessToken,
    props.appAccessToken,
  )

  if (targetIds.length <= 1) {
    return targetIds[0] ?? null
  }

  const classifications = await Promise.all(
    targetIds.map((targetId) =>
      classifyTarget({ targetId, accessToken, version }),
    ),
  )

  const wabas = classifications.filter((candidate) => candidate.isWaba)
  if (wabas.length === 0) {
    return warnUnresolved(classifications, "noTargetIsAWaba")
  }
  if (wabas.length === 1) {
    return wabas[0]?.targetId ?? null
  }

  return pickOwningWaba(classifications, {
    accessToken,
    version,
    systemUserToken: props.systemUserToken,
    systemUserId: props.systemUserId,
    phoneNumberIds: props.phoneNumberIds ?? [],
  })
}
