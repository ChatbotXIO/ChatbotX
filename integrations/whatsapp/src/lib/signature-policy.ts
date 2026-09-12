import type { WhatsappConfig } from "../schema"

export type SignaturePolicy = "enforce" | "legacy-unverified"

type SignaturePolicyTableKey =
  | "hasSecret"
  | "noSecretManual"
  | "noSecretNonManual"

/**
 * Table-driven policy: whether an inbound webhook's signature is verified.
 *
 * - `hasSecret` — every platform-credential integration, and any manual
 *   integration whose owner has supplied a Meta App Secret. Full HMAC
 *   verification, exactly like every other channel.
 * - `noSecretManual` — a manual integration with no app secret configured.
 *   This is the pre-existing state of every manual integration today: they
 *   were never signature-verified, so keep accepting their webhooks
 *   unverified rather than breaking a running integration. Logged once per
 *   request so the gap stays visible in production.
 * - `noSecretNonManual` — a platform-credential integration with no secret.
 *   This is a misconfiguration, not a legacy path: reject.
 */
const SIGNATURE_POLICY_TABLE: Record<SignaturePolicyTableKey, SignaturePolicy> =
  {
    hasSecret: "enforce",
    noSecretManual: "legacy-unverified",
    noSecretNonManual: "enforce",
  }

const signaturePolicyTableKey = (
  config: WhatsappConfig,
): SignaturePolicyTableKey => {
  if (config.clientSecret) {
    return "hasSecret"
  }
  return config.manualIntegration ? "noSecretManual" : "noSecretNonManual"
}

export const resolveSignaturePolicy = (
  config: WhatsappConfig,
): SignaturePolicy => SIGNATURE_POLICY_TABLE[signaturePolicyTableKey(config)]
