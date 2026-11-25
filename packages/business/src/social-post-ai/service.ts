import { socialPostRepository } from "@chatbotx.io/database/repositories"
import { distributedStore } from "@chatbotx.io/redis"
import type { SocialProvider } from "@chatbotx.io/utils/social-account"
import { ChatbotXException, validationException } from "../errors"
import { requestHash } from "../social-post/hash"
import {
  clampToLimits,
  type ProviderTextLimit,
  postTextLimitsFor,
  shortestLimit,
  stripControlCharacters,
} from "./text-limits"

/** Calls a workspace may make per minute and per day; bounds the provider spend. */
export const POST_AI_MAX_PER_MINUTE = 30
export const POST_AI_MAX_PER_DAY = 500
/** A finished call (result or provider failure) is replayed for this long. */
export const POST_AI_REPLAY_TTL_SECONDS = 600
/** Longer than the provider call's own abort, so a live call never loses its claim. */
export const POST_AI_INFLIGHT_TTL_SECONDS = 30

const MINUTE_SECONDS = 60
const DAY_SECONDS = 86_400

export type PostAiFailureCode =
  | "emptyOutput"
  | "integrationUnavailable"
  | "providerError"
  | "rateLimited"
  | "timeout"

/** What the model produced: one or more texts, or (mode `hashtags`) only tags. */
export type PostAiDraft = {
  hashtags?: string[]
  variants: { provider?: SocialProvider | null; text: string }[]
}

export type PostAiVariant = {
  /** The limit this text was cut to, or `null` when its network documents none. */
  limit: number | null
  /** Set for a per-network version. */
  provider: SocialProvider | null
  text: string
  truncated: boolean
}

export type PostAiResult = {
  /** Tags only for mode `hashtags`. */
  hashtags: string[]
  /** The limit the text was cut to, or `null` when no network documents one. */
  limit: number | null
  /** The first variant's text (kept for callers that read one suggestion). */
  text: string
  /** True when any variant was cut to its limit. */
  truncated: boolean
  usage: { inputChars: number; outputChars: number }
  variants: PostAiVariant[]
}

/** The provider failed (or answered nothing); a repeat of the same call replays it. */
export class PostAiProviderFailure extends Error {
  readonly code: PostAiFailureCode

  constructor(code: PostAiFailureCode, cause?: unknown) {
    super(`post-ai-provider-failure: ${code}`, { cause })
    this.name = "PostAiProviderFailure"
    this.code = code
  }
}

type StoredCall =
  | { hash: string; state: "running" }
  | { hash: string; result: PostAiResult; state: "done" }
  | { code: PostAiFailureCode; hash: string; state: "failed" }

const keyPrefix = (workspaceId: string) => `postai:${workspaceId}`

const rateLimitedException = () =>
  new ChatbotXException(
    "Too many AI writing requests. Try again in a moment.",
    "aiRateLimited",
    429,
  )
const inProgressException = () =>
  new ChatbotXException(
    "An AI writing request is already running.",
    "aiRequestInProgress",
    409,
  )
const keyReusedException = () =>
  new ChatbotXException(
    "This idempotency key was already used with a different request.",
    "aiKeyReused",
    422,
  )

const parseStored = (raw: string | null): StoredCall | null => {
  if (raw === null) {
    return null
  }
  try {
    return JSON.parse(raw) as StoredCall
  } catch {
    return null
  }
}

export type GeneratePostTextRun<Prepared> = {
  /** The caller: a member id, or a constant for an API token. One call at a time each. */
  actorId: string
  idempotencyKey: string
  /** Characters of untrusted text the provider receives (reported back as usage). */
  inputChars: number
  /** Each network's text limit; the answer is cut to fit all of them. */
  limits: readonly ProviderTextLimit[]
  /** Cheap checks that must fail before any cost (is a model configured?). */
  prepare: () => Promise<Prepared>
  /** The one paid provider call. Throws {@link PostAiProviderFailure}. */
  produce: (prepared: Prepared) => Promise<PostAiDraft | string>
  /** Everything that decides the output; the same key with another request is refused. */
  request: unknown
  workspaceId: string
}

class SocialPostAiService {
  /** The text limit of each network the destinations belong to. */
  async limitsForDestinations(input: {
    destinationIds: string[]
    workspaceId: string
  }): Promise<ProviderTextLimit[]> {
    if (input.destinationIds.length === 0) {
      return []
    }
    const rows = await socialPostRepository.findDestinations({
      ids: input.destinationIds,
      workspaceId: input.workspaceId,
    })
    if (rows.length !== new Set(input.destinationIds).size) {
      throw validationException(
        "destinationIds",
        "A destination was not found.",
      )
    }
    const providers: SocialProvider[] = [
      ...new Set(rows.map((row) => row.provider)),
    ]
    return postTextLimitsFor(providers)
  }

  /**
   * One guarded generation. The idempotency key is reserved (`SET NX`) before
   * anything is paid for, so a repeat, a double click or a retry after a
   * timeout never makes a second provider call: it gets the stored result or
   * failure for 10 minutes, or a 409 while the first call still runs. Then one
   * call per actor at a time, and 30 per minute / 500 per day per workspace.
   * Only a provider failure is remembered; a refusal before the call (no
   * model, over a cap) frees the key so the same call can be made again.
   */
  async generate<Prepared>(
    input: GeneratePostTextRun<Prepared>,
  ): Promise<PostAiResult> {
    const prefix = keyPrefix(input.workspaceId)
    const idemKey = `${prefix}:idem:${await requestHash(input.idempotencyKey)}`
    const hash = await requestHash(input.request)

    const replay = await this.reserve(idemKey, hash)
    if (replay) {
      return replay
    }

    const busyKey = `${prefix}:busy:${input.actorId}`
    let holdsBusy = false
    try {
      const prepared = await input.prepare()
      holdsBusy = await distributedStore.claimKey(
        busyKey,
        idemKey,
        POST_AI_INFLIGHT_TTL_SECONDS,
      )
      if (!holdsBusy) {
        throw inProgressException()
      }
      await this.takeRateSlot(prefix)
      const result = this.finish(await input.produce(prepared), input)
      await distributedStore.put(
        idemKey,
        { hash, result, state: "done" } satisfies StoredCall,
        POST_AI_REPLAY_TTL_SECONDS,
      )
      return result
    } catch (error) {
      if (error instanceof PostAiProviderFailure) {
        await distributedStore.put(
          idemKey,
          { code: error.code, hash, state: "failed" } satisfies StoredCall,
          POST_AI_REPLAY_TTL_SECONDS,
        )
      } else {
        await distributedStore.delete(idemKey)
      }
      throw error
    } finally {
      if (holdsBusy) {
        await distributedStore.releaseKeyIfOwner(busyKey, idemKey)
      }
    }
  }

  /** `null` when this call took the key; the stored outcome otherwise (or a throw). */
  private async reserve(
    idemKey: string,
    hash: string,
  ): Promise<PostAiResult | null> {
    const attempts = 2
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const claimed = await distributedStore.claimKey(
        idemKey,
        JSON.stringify({ hash, state: "running" } satisfies StoredCall),
        POST_AI_INFLIGHT_TTL_SECONDS,
      )
      if (claimed) {
        return null
      }
      const stored = parseStored(await distributedStore.getKeyOwner(idemKey))
      if (!stored) {
        // Expired between the two calls: try to take it again.
        continue
      }
      if (stored.hash !== hash) {
        throw keyReusedException()
      }
      if (stored.state === "done") {
        return stored.result
      }
      if (stored.state === "failed") {
        throw new PostAiProviderFailure(stored.code)
      }
      throw inProgressException()
    }
    throw inProgressException()
  }

  private async takeRateSlot(prefix: string): Promise<void> {
    const perMinute = await distributedStore.incrWithWindow(
      `${prefix}:rate:minute`,
      MINUTE_SECONDS,
    )
    if (perMinute > POST_AI_MAX_PER_MINUTE) {
      throw rateLimitedException()
    }
    const perDay = await distributedStore.incrWithWindow(
      `${prefix}:rate:day`,
      DAY_SECONDS,
    )
    if (perDay > POST_AI_MAX_PER_DAY) {
      throw rateLimitedException()
    }
  }

  private finish(
    raw: PostAiDraft | string,
    input: Pick<GeneratePostTextRun<unknown>, "inputChars" | "limits">,
  ): PostAiResult {
    const draft: PostAiDraft =
      typeof raw === "string" ? { variants: [{ text: raw }] } : raw
    const variants = draft.variants.flatMap((item): PostAiVariant[] => {
      const cleaned = stripControlCharacters(item.text).trim()
      if (!cleaned) {
        return []
      }
      // A per-network version is cut to its own network's limit only.
      const own = item.provider
        ? input.limits.filter((limit) => limit.provider === item.provider)
        : []
      const limits = own.length > 0 ? own : input.limits
      const { text, truncated } = clampToLimits(cleaned, limits)
      return [
        {
          limit: shortestLimit(limits),
          provider: item.provider ?? null,
          text,
          truncated,
        },
      ]
    })
    const hashtags = draft.hashtags ?? []
    const [first] = variants
    if (!first && hashtags.length === 0) {
      throw new PostAiProviderFailure("emptyOutput")
    }
    const text = first?.text ?? hashtags.join(" ")
    return {
      hashtags,
      limit: shortestLimit(input.limits),
      text,
      truncated: variants.some((item) => item.truncated),
      usage: {
        inputChars: input.inputChars,
        outputChars:
          variants.reduce((sum, item) => sum + item.text.length, 0) ||
          text.length,
      },
      variants,
    }
  }
}

export const socialPostAiService = new SocialPostAiService()
