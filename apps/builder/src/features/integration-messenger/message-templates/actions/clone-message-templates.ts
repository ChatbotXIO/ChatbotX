"use server"

import { integrationMessengerRepository } from "@chatbotx.io/database/repositories"
import { createPageMessageTemplate } from "@chatbotx.io/integration-messenger/apis/message-templates"
import { resumableUploadImage } from "@chatbotx.io/integration-messenger/apis/upload"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { chunk } from "remeda"
import { z } from "zod"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { workspaceActionClient } from "@/lib/safe-action"
import { syncMessengerMessageTemplatesForIntegration } from "./sync-message-templates"

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function isMetaImageUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname
    return (
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com") ||
      hostname.endsWith(".fbcdn.net") ||
      hostname.endsWith(".fbsbx.com")
    )
  } catch {
    return false
  }
}

function stripLegacyInternalHeaderImageUrl(
  // biome-ignore lint/suspicious/noExplicitAny: Meta component example shape varies
  example: any,
) {
  if (!example || typeof example !== "object") {
    return example
  }

  const { header_image_url: _headerImageUrl, ...rest } = example
  return rest
}

function getStoredHeaderImageUrl(
  // biome-ignore lint/suspicious/noExplicitAny: Meta component shape varies
  component: any,
): string | undefined {
  const headerHandle: string | undefined = component.example?.header_handle?.[0]
  if (headerHandle && isHttpUrl(headerHandle)) {
    return headerHandle
  }

  const legacyInternalImageUrl: string | undefined =
    component.example?.header_image_url
  if (legacyInternalImageUrl && isHttpUrl(legacyInternalImageUrl)) {
    return legacyInternalImageUrl
  }

  return
}

function withHeaderHandle(
  // biome-ignore lint/suspicious/noExplicitAny: Meta component shape varies
  component: any,
  headerHandle: string,
) {
  return {
    ...component,
    example: {
      ...stripLegacyInternalHeaderImageUrl(component.example),
      header_handle: [headerHandle],
    },
  }
}

// IMAGE header handles are page-scoped. The DB stores Meta's listed image URL in
// example.header_handle[0], while the create-template request needs a freshly
// uploaded handle for each target Page.
export async function prepareComponentsForClone(
  // biome-ignore lint/suspicious/noExplicitAny: Meta API component shape varies
  components: any[],
  auth: MessengerAuthValue,
  // biome-ignore lint/suspicious/noExplicitAny: Meta API component shape varies
): Promise<any[]> {
  return await Promise.all(
    // biome-ignore lint/suspicious/noExplicitAny: Meta API component shape varies
    components.map(async (c: any) => {
      if (
        c.type?.toUpperCase() !== "HEADER" ||
        c.format?.toUpperCase() !== "IMAGE"
      ) {
        return c
      }
      const storedHeaderImageUrl = getStoredHeaderImageUrl(c)

      if (!storedHeaderImageUrl) {
        throw new Error(
          "Image header cannot be cloned because Meta returned a page-owned file handle instead of a downloadable image URL. Recreate the template on the target channel with the original image.",
        )
      }

      const newHandle = await resumableUploadImage(auth, storedHeaderImageUrl, {
        authenticatedDownload: isMetaImageUrl(storedHeaderImageUrl),
      })

      return withHeaderHandle(c, newHandle)
    }),
  )
}

export const cloneMessengerMessageTemplateAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    zodBigintAsString(),
  ])
  .schema(
    z.object({
      targetIntegrationMessengerIds: z.array(zodBigintAsString()).min(1),
    }),
  )
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [
        workspaceId,
        sourceIntegrationMessengerId,
        templateId,
      ],
      parsedInput: { targetIntegrationMessengerIds },
      ctx: { user },
    } = props

    // Load source template, verifying it belongs to the source integration + workspace
    const sourceTemplate =
      await integrationMessengerRepository.findMessageTemplateForClone({
        workspaceId,
        integrationMessengerId: sourceIntegrationMessengerId,
        templateId,
      })

    if (!sourceTemplate) {
      throw new Error("Source template not found")
    }

    // Source integration (for its pageId — never clone a template onto its own page).
    const sourceIntegration =
      await integrationMessengerRepository.findPageIdById({
        workspaceId,
        id: sourceIntegrationMessengerId,
      })

    // Resolve target rows by id (targets may live in OTHER workspaces).
    const candidateTargets = await integrationMessengerRepository.listByIds({
      ids: targetIntegrationMessengerIds,
    })

    // Authorize per target: the user must be an owner of the target's workspace,
    // and the target must not be the source's own Facebook Page.
    const { workspaceMembers } = await getAllWorkspaceMembers(user.id)
    const ownerWorkspaceIds = new Set(
      workspaceMembers
        .filter((member) => member.role === "owner")
        .map((member) => member.workspaceId),
    )
    const targets = candidateTargets.filter(
      (target) =>
        ownerWorkspaceIds.has(target.workspaceId) &&
        target.pageId !== sourceIntegration?.pageId,
    )

    if (targets.length === 0) {
      throw new Error("No authorized target channels found")
    }

    const succeeded: { channel: string }[] = []
    const failed: { channel: string; error: string }[] = []

    const BATCH_SIZE = 5

    const cloneOne = async (
      target: (typeof targets)[number],
    ): Promise<void> => {
      const auth = target.auth as MessengerAuthValue
      try {
        // Re-upload IMAGE headers to the target page before creating the template.
        const components = await prepareComponentsForClone(
          // biome-ignore lint/suspicious/noExplicitAny: Meta API component shape varies
          sourceTemplate.components as any[],
          auth,
        )

        const resp = await createPageMessageTemplate(auth, {
          name: sourceTemplate.name,
          category: sourceTemplate.category as
            | "AUTHENTICATION"
            | "MARKETING"
            | "UTILITY",
          language: sourceTemplate.language,
          parameter_format: sourceTemplate.parameterFormat,
          components,
        })

        if (resp.status === "APPROVED") {
          await syncMessengerMessageTemplatesForIntegration({
            workspaceId: target.workspaceId,
            integrationMessenger: target,
            templateId: resp.id,
            templateName: sourceTemplate.name,
            templateLanguage: sourceTemplate.language,
          })
          succeeded.push({ channel: target.name })
        } else {
          failed.push({
            channel: target.name,
            error: `Template returned status: ${resp.status}`,
          })
        }
      } catch (error) {
        const message =
          error instanceof SdkException || error instanceof Error
            ? error.message
            : "Unknown error occurred"
        failed.push({ channel: target.name, error: message })
      }
    }

    const batches = chunk(targets, BATCH_SIZE)
    for (const batch of batches) {
      await Promise.allSettled(batch.map(cloneOne))
    }

    // Revalidate every workspace that received a clone, plus the source.
    const affectedWorkspaceIds = new Set(
      targets.map((target) => target.workspaceId),
    )
    affectedWorkspaceIds.add(workspaceId)
    for (const affectedWorkspaceId of affectedWorkspaceIds) {
      await invalidateCacheByTags([
        `workspaces:${affectedWorkspaceId}#messenger#messageTemplates`,
      ])
    }

    return { succeeded, failed }
  })
