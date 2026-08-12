"use server"

import { adsConversionService } from "@chatbotx.io/business"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  createAdsConversionRuleRequest,
  deleteAdsConversionRuleRequest,
  toggleAdsConversionRuleRequest,
  updateAdsConversionRuleRequest,
} from "../schemas/conversion-rule"

export const createAdsConversionRuleAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(createAdsConversionRuleRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string]
      ctx: { workspace: WorkspaceModel }
      parsedInput: typeof createAdsConversionRuleRequest._output
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      return adsConversionService.create({
        ...parsedInput,
        workspaceId,
      })
    },
  )

export const updateAdsConversionRuleAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(updateAdsConversionRuleRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string]
      ctx: { workspace: WorkspaceModel }
      parsedInput: typeof updateAdsConversionRuleRequest._output
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      return adsConversionService.update({
        ...parsedInput,
        workspaceId,
      })
    },
  )

export const toggleAdsConversionRuleAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(toggleAdsConversionRuleRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string]
      ctx: { workspace: WorkspaceModel }
      parsedInput: typeof toggleAdsConversionRuleRequest._output
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      return adsConversionService.toggleEnabled({
        ...parsedInput,
        workspaceId,
      })
    },
  )

export const deleteAdsConversionRuleAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(deleteAdsConversionRuleRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string]
      ctx: { workspace: WorkspaceModel }
      parsedInput: typeof deleteAdsConversionRuleRequest._output
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      await adsConversionService.remove({
        ...parsedInput,
        workspaceId,
      })
    },
  )
