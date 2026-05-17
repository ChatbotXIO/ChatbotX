/**
 * Backfill OrganizationCredential rows from legacy Organization.settings jsonb.
 *
 * For each organization, for each provider key present in `settings`, insert an
 * OrganizationCredential row of the corresponding type unless one already
 * exists (idempotent — safe to re-run). Runs inside a per-org transaction.
 * After credentials are safely written, the credential keys are removed from
 * Organization.settings to eliminate plaintext secrets at rest.
 *
 * Usage: pnpm --filter @chatbotx.io/database backfill:organization-credentials
 */
import { encryptUtils } from "@chatbotx.io/encryption"
import { and, eq } from "drizzle-orm"
import { db } from "../src/client"
import type { OrganizationSettings } from "../src/partials/organization"
import {
  type OrganizationCredentialByType,
  type OrganizationCredentialType,
  organizationCredentialPublicSchemas,
} from "../src/partials/organization-credential"
import { organizationModel } from "../src/schema/organization"
import { organizationCredentialModel } from "../src/schema/organization-credential"

const CREDENTIAL_KEYS: OrganizationCredentialType[] = [
  "whatsapp",
  "messenger",
  "instagram",
  "google",
  "zalo",
  "giphy",
  "stripe",
]

const main = async (): Promise<void> => {
  const organizations = await db
    .select({
      id: organizationModel.id,
      settings: organizationModel.settings,
    })
    .from(organizationModel)

  let totalInserted = 0
  let totalSkipped = 0
  let totalCleared = 0
  let totalErrors = 0

  for (const org of organizations) {
    const settings = org.settings
    if (!settings) {
      continue
    }

    const candidates: {
      type: OrganizationCredentialType
      config:
        | OrganizationCredentialByType[OrganizationCredentialType]
        | undefined
    }[] = CREDENTIAL_KEYS.map((type) => ({
      type,
      config: settings[type as keyof OrganizationSettings] as
        | OrganizationCredentialByType[OrganizationCredentialType]
        | undefined,
    }))

    const hasAnyCredentialInSettings = candidates.some(({ config }) => !!config)
    if (!hasAnyCredentialInSettings) {
      continue
    }

    try {
      await db.transaction(async (tx) => {
        for (const { type, config } of candidates) {
          if (!config) {
            continue
          }

          const existing = await tx
            .select({ id: organizationCredentialModel.id })
            .from(organizationCredentialModel)
            .where(
              and(
                eq(organizationCredentialModel.organizationId, org.id),
                eq(organizationCredentialModel.type, type),
              ),
            )
            .limit(1)
            .then((rows) => rows[0])

          if (existing) {
            totalSkipped += 1
            continue
          }

          const publicConfig =
            organizationCredentialPublicSchemas[type].parse(config)
          const aad = `${org.id}:${type}`
          const value = await encryptUtils.encryptObject(config, aad)

          await tx.insert(organizationCredentialModel).values({
            organizationId: org.id,
            type,
            publicConfig,
            value,
          })
          totalInserted += 1
        }

        // Remove credential keys from legacy settings now that the data is
        // safely encrypted in OrganizationCredential.
        const {
          whatsapp: _w,
          messenger: _m,
          instagram: _i,
          google: _g,
          zalo: _z,
          giphy: _gi,
          stripe: _s,
          ...remaining
        } = settings as Record<string, unknown>

        await tx
          .update(organizationModel)
          .set({ settings: remaining as OrganizationSettings })
          .where(eq(organizationModel.id, org.id))

        totalCleared += 1
      })
    } catch (error) {
      console.error(`[org:${org.id}] Failed — skipping org:`, error)
      totalErrors += 1
    }
  }

  console.log(
    `Backfill complete: ${totalInserted} inserted, ${totalSkipped} skipped, ` +
      `${totalCleared} orgs cleared of legacy settings, ${totalErrors} errors.`,
  )

  if (totalErrors > 0) {
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error)
    process.exit(1)
  })
