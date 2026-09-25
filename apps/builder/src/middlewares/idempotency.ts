import { ORPCError } from "@orpc/server"
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  fingerprintInput,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  isValidIdempotencyKey,
  releaseIdempotencyKey,
} from "@/lib/idempotency/api-idempotency"
import { base } from "./context"

/**
 * Opt-in retry protection for authenticated HTTP API calls. RPC batches share
 * one HTTP response, so `Idempotent-Replayed` is meaningful only unbatched.
 */
export const apiIdempotencyMiddleware = base.middleware(
  async ({ context, next, path, procedure }, input: unknown, output) => {
    const rawKey = context.headers.get(IDEMPOTENCY_KEY_HEADER)
    if (rawKey === null) {
      return await next()
    }

    const method = (procedure["~orpc"].route.method ?? "POST").toUpperCase()
    if (method === "GET" || method === "HEAD") {
      return await next()
    }

    const idempotencyKey = rawKey.trim()
    if (!isValidIdempotencyKey(idempotencyKey)) {
      throw new ORPCError("idempotencyKeyInvalid", {
        status: 422,
        message: "Idempotency-Key must be 1-255 characters",
      })
    }

    const credentialId = context.apiCredentialId
    if (!credentialId) {
      return await next()
    }

    const scope = {
      credentialId,
      method,
      procedurePath: path.join("."),
      idempotencyKey,
    }
    const fingerprint = await fingerprintInput(input)
    const claim = await claimIdempotencyKey({ ...scope, fingerprint })

    if (claim.kind === "fingerprintMismatch") {
      throw new ORPCError("idempotencyKeyReused", {
        status: 422,
        message:
          "This Idempotency-Key was already used with a different request",
      })
    }
    if (claim.kind === "inFlight") {
      throw new ORPCError("idempotencyKeyConflict", {
        status: 409,
        message: "A request with this Idempotency-Key is still in progress",
      })
    }
    if (claim.kind === "unprotected") {
      return await next()
    }
    if (claim.kind === "replay") {
      context.resHeaders?.set(IDEMPOTENT_REPLAYED_HEADER, "true")
      return output(claim.hasOutput ? claim.output : undefined)
    }

    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next()
    } catch (err) {
      await releaseIdempotencyKey({ ...scope, claimId: claim.claimId })
      throw err
    }

    await completeIdempotencyKey({
      ...scope,
      fingerprint,
      claimId: claim.claimId,
      output: result.output,
    })
    return result
  },
)
