import { ORPCError, os } from "@orpc/server"
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  fingerprintInput,
  isValidIdempotencyKey,
  releaseIdempotencyKey,
} from "@/lib/idempotency/api-idempotency"
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
} from "@/lib/idempotency/constants"
import { possibleIdempotencyErrors } from "@/lib/orpc/orpc-error-helper"
import type { BaseContext } from "./context"

const idempotencyError = (code: keyof typeof possibleIdempotencyErrors) =>
  new ORPCError(code, possibleIdempotencyErrors[code])

/**
 * Opt-in retry protection for authenticated HTTP API calls. RPC batches share
 * one HTTP response, so `Idempotent-Replayed` is meaningful only unbatched.
 */
export const apiIdempotencyMiddleware = os
  .$context<BaseContext & { apiCredentialId: string }>()
  .middleware(
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
        throw idempotencyError("idempotencyKeyInvalid")
      }

      const scope = {
        credentialId: context.apiCredentialId,
        method,
        procedurePath: path.join("."),
        idempotencyKey,
      }
      const fingerprint = await fingerprintInput(input)
      const claim = await claimIdempotencyKey({ ...scope, fingerprint })

      if (claim.kind === "fingerprintMismatch") {
        throw idempotencyError("idempotencyKeyReused")
      }
      if (claim.kind === "inFlight") {
        throw idempotencyError("idempotencyKeyConflict")
      }
      if (claim.kind === "unprotected") {
        return await next()
      }
      if (claim.kind === "replay") {
        context.resHeaders?.set(IDEMPOTENT_REPLAYED_HEADER, "true")
        return output(claim.output)
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
