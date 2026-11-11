import { db } from "@chatbotx.io/database/client"
import type { TenantDefaultTemplateStatus } from "@chatbotx.io/database/partials"
import {
  templateRepository,
  tenantDefaultTemplateRepository,
} from "@chatbotx.io/database/repositories"
import { encryptUtils } from "@chatbotx.io/encryption"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { resolveDefaultTemplateStatus } from "../../template/default-template-status"
import { isShareLive } from "../../template/share-live"
import {
  tenantDefaultTemplateShareDisabledException,
  tenantDefaultTemplateUnavailableException,
} from "../../template/template-errors"
import { resolveTenantAdminScope, type TenantAdminScope } from "./admin-scope"

/** Whose default template: a reseller's own tenant, or the platform's root tenant. */
export type DefaultTemplateScope = TenantAdminScope

/** A configured default and whether it can install; there is no such value when nothing is configured. */
export type TenantDefaultTemplateConfig = {
  templateId: string
  status: TenantDefaultTemplateStatus
  /**
   * The key the owner saved, as saved: it stays after the publisher rotates the template's key
   * (status `keyRotated`), when saving it again is refused.
   */
  templateKey: string
}

/** Binds the stored key to its tenant, so a ciphertext copied to another row does not decrypt. */
const keyAad = (tenantId: string): string => `tenantDefaultTemplate:${tenantId}`

/** The template a white-label installs into every workspace created under it. */
export const tenantDefaultTemplateService = {
  async getSettings(input: {
    scope: DefaultTemplateScope
  }): Promise<TenantDefaultTemplateConfig | null> {
    const tenantId = await resolveTenantAdminScope(input.scope)
    if (!tenantId) {
      return null
    }
    const config =
      await tenantDefaultTemplateRepository.findWithTemplate(tenantId)
    if (!config) {
      return null
    }
    const status = await resolveDefaultTemplateStatus(tenantId, config)
    return {
      templateId: config.template.id,
      status,
      templateKey: await encryptUtils.decryptText(
        config.encryptedKey,
        keyAad(tenantId),
      ),
    }
  },

  async set(input: {
    scope: DefaultTemplateScope
    templateId: string
    templateKey: string
    /** Who is changing it; kept in the tenant's history. */
    actorUserId: string
  }): Promise<void> {
    // Never provisions a tenant: only an owner who already has one (the
    // entitlement `reconcileOwnerEntitlement` guards) can set a default.
    const tenantId = await resolveTenantAdminScope(input.scope)
    if (!tenantId) {
      throw tenantDefaultTemplateUnavailableException()
    }
    const template = await templateRepository.findByIdForTenant({
      id: input.templateId,
      tenantId,
    })
    const keyHash = await sha256Hex(input.templateKey)
    // One answer for missing, deleted, other-tenant and wrong key.
    if (
      !template ||
      template.deletedAt ||
      (await sha256Hex(template.shareToken)) !== keyHash
    ) {
      throw tenantDefaultTemplateUnavailableException()
    }
    if (!isShareLive(template)) {
      throw tenantDefaultTemplateShareDisabledException()
    }
    await db.transaction(async (tx) => {
      await tenantDefaultTemplateRepository.upsert(
        {
          tenantId,
          templateId: template.id,
          keyHash,
          encryptedKey: await encryptUtils.encryptText(
            input.templateKey,
            keyAad(tenantId),
          ),
        },
        tx,
      )
      await tenantDefaultTemplateRepository.recordEvent(
        {
          tenantId,
          action: "set",
          templateId: template.id,
          actorUserId: input.actorUserId,
        },
        tx,
      )
    })
  },

  async clear(input: {
    scope: DefaultTemplateScope
    /** Who is removing it; kept in the tenant's history. */
    actorUserId: string
  }): Promise<void> {
    const tenantId = await resolveTenantAdminScope(input.scope)
    if (!tenantId) {
      return
    }
    await db.transaction(async (tx) => {
      const removedTemplateId = await tenantDefaultTemplateRepository.delete(
        tenantId,
        tx,
      )
      if (removedTemplateId) {
        await tenantDefaultTemplateRepository.recordEvent(
          {
            tenantId,
            action: "cleared",
            templateId: removedTemplateId,
            actorUserId: input.actorUserId,
          },
          tx,
        )
      }
    })
  },
}
