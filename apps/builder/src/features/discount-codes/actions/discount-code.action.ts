"use server"

import { discountCodeService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schema"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import { toDiscountCodeInput } from "../lib/to-input"
import { discountCodeWriteRequest } from "../schema/public"

export const createDiscountCodeAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(discountCodeWriteRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const row = await discountCodeService.create({
      workspaceId,
      ...toDiscountCodeInput(parsedInput),
    })
    return { id: row.id }
  })

/** The form always sends every field, so this replaces the whole code. */
export const updateDiscountCodeAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(discountCodeWriteRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, discountCodeId],
      parsedInput,
    }) => {
      const row = await discountCodeService.update({
        workspaceId,
        discountCodeId,
        data: toDiscountCodeInput(parsedInput),
      })
      return { id: row.id }
    },
  )

export const setDiscountCodeActiveAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(z.object({ isActive: z.boolean() }))
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, discountCodeId],
      parsedInput,
    }) => {
      await discountCodeService.setActive({
        workspaceId,
        discountCodeId,
        isActive: parsedInput.isActive,
      })
    },
  )

export const deleteDiscountCodeAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, discountCodeId] }) => {
    await discountCodeService.delete({ workspaceId, discountCodeId })
  })

export const generateDiscountCodeAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId] }) => ({
    code: await discountCodeService.generateCode(workspaceId),
  }))
