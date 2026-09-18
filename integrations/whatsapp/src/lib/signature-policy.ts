import type { WhatsappConfig } from "../schema"

export type SignaturePolicy = "enforce" | "legacy-unverified"

type SignaturePolicyTableKey =
  | "hasSecret"
  | "noSecretManual"
  | "noSecretNonManual"

/**
 * Table-driven policy: whether an inbound webhook's signature is verified.
 *
 * - `noSecretManual` — a manual integration with no app secret: accept unverified rather
 *   than break a running integration (logged once per request to stay visible).
 * - `noSecretNonManual` — a platform-credential integration with no secret is a
 *   misconfiguration, not an accepted state: reject.
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
