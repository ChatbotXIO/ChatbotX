import "server-only"

import { messengerIntegrationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type AudienceUploadSource,
  facebookMarketingMessageAudienceService,
} from "@chatbotx.io/business/facebook-marketing-message-audience"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"
import { toUploadOutcome, withAudienceErrors } from "./audience-errors"
import type { UploadOutcome } from "./audience-upload"
import { requireValidGrant } from "./grant"
import { requireTosAcceptedAdAccount } from "./tos-accepted-account"

/**
 * The one implementation behind the builder's audience actions and the public
 * API (AGENTS.md invariant 23). The source is either an uploaded `File` (UI) or
 * already-parsed rows (API) — only the file-reading step differs; the service
 * applies the same limits and the same create path to both.
 */
export type AudienceSourceInput =
  | { file: File; table?: undefined }
  | { table: { headers: string[]; rows: string[][] }; file?: undefined }

async function toSource(
  input: AudienceSourceInput,
): Promise<AudienceUploadSource> {
  if (input.file) {
    return {
      fileName: input.file.name,
      buffer: Buffer.from(await input.file.arrayBuffer()),
    }
  }
  return input.table
}

export type CreateAudienceOperationInput = AudienceSourceInput & {
  adAccountId: string
  pageId: string
  name: string
  description?: string
}

/**
 * Everything checked before the Graph create. A rejection here means nothing
 * was created, so it is reported as `invalid` (the client keeps Upload
 * enabled) rather than thrown (which the client must treat as uncertain).
 */
async function runPreflight({
  workspace,
  input,
}: {
  workspace: WorkspaceModel
  input: CreateAudienceOperationInput
}) {
  try {
    const grant = await requireValidGrant(workspace)
    await requireTosAcceptedAdAccount(grant, input.adAccountId)
    const t = await getTranslations()

    const page = await messengerIntegrationService.findByPageId({
      workspaceId: workspace.id,
      pageId: input.pageId,
    })
    if (!page) {
      throw new ChatbotXException(
        t("facebookMarketingMessages.audiences.errors.pageNotConnected"),
      )
    }
    return { ok: true as const, grant }
  } catch (error) {
    if (error instanceof ChatbotXException) {
      return {
        ok: false as const,
        outcome: {
          status: "invalid" as const,
          message: error.message,
        },
      }
    }
    throw error
  }
}

/**
 * Server-side boundary (the client selects are conveniences): the ad account
 * must be visible to THIS grant with ToS accepted, and the Page must belong
 * to this workspace.
 */
export async function createAudience({
  workspace,
  input,
}: {
  workspace: WorkspaceModel
  input: CreateAudienceOperationInput
}): Promise<UploadOutcome> {
  const preflight = await runPreflight({ workspace, input })
  if (!preflight.ok) {
    return preflight.outcome
  }
  const { grant } = preflight

  const file = await toSource(input)
  return await toUploadOutcome(() =>
    facebookMarketingMessageAudienceService.create({
      workspaceId: workspace.id,
      grant,
      adAccountId: input.adAccountId,
      pageId: input.pageId,
      name: input.name,
      description: input.description ? input.description : null,
      file,
    }),
  )
}

export async function uploadMoreAudience({
  workspace,
  input,
}: {
  workspace: WorkspaceModel
  input: AudienceSourceInput & { id: string }
}): Promise<UploadOutcome> {
  const grant = await requireValidGrant(workspace)
  const file = await toSource(input)
  return await toUploadOutcome(() =>
    facebookMarketingMessageAudienceService.uploadMore({
      workspaceId: workspace.id,
      grant,
      id: input.id,
      file,
    }),
  )
}

/** Deletes on Meta first; the row goes only if Meta deleted it or it was already gone. */
export async function deleteAudience({
  workspace,
  id,
}: {
  workspace: WorkspaceModel
  id: string
}): Promise<void> {
  const grant = await requireValidGrant(workspace)
  await withAudienceErrors(() =>
    facebookMarketingMessageAudienceService.delete({
      workspaceId: workspace.id,
      grant,
      id,
    }),
  )
}
