import type { z } from "zod"
import { encryptedDataSchema, encryptUtils } from "./encryption"

export async function signAppointmentToken<TPayload extends object>(
  payload: TPayload,
  aad: string,
): Promise<string> {
  const encrypted = await encryptUtils.encryptObject(payload, aad)
  return Buffer.from(JSON.stringify(encrypted)).toString("base64url")
}

export async function verifyAppointmentToken<TPayload>(
  token: string,
  aad: string,
  schema: z.ZodType<TPayload>,
): Promise<TPayload> {
  const json = Buffer.from(token, "base64url").toString("utf8")
  const encrypted = encryptedDataSchema.parse(JSON.parse(json))
  // This comparison is now the SOLE enforcement of purpose separation:
  // decryptObject reads its aad off the blob rather than taking one from the
  // caller, so a schedule token would otherwise decrypt cleanly when
  // verified as a cancel token. See appointment-tokens.test.ts "does not
  // allow schedule tokens to be used as cancel tokens".
  if (encrypted.aad !== aad) {
    throw new Error("Appointment token type mismatch")
  }
  const payload = await encryptUtils.decryptObject(encrypted, schema)
  const expiresAt =
    typeof payload === "object" && payload && "expiresAt" in payload
      ? payload.expiresAt
      : undefined
  if (typeof expiresAt !== "number" || expiresAt < Date.now()) {
    throw new Error("Appointment token has expired")
  }
  return payload
}
