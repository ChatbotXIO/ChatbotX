"use server"

import { authActionClient } from "@/lib/safe-action"
import { type User, prisma } from "@ahachat.ai/database"
import {
  type UpdateAutomatedResponseBindSchema,
  type UpdateAutomatedResponseSchema,
  type UpdateStatusAutomatedResponseSchema,
  updateAutomatedResponseBindSchema,
  updateAutomatedResponseSchema,
  updateStatusAutomatedResponseSchema,
} from "../schemas/update-automated-responses-schema"

export const updateAutomatedResponseAction = authActionClient
  .schema(updateAutomatedResponseSchema)
  .bindArgsSchemas(updateAutomatedResponseBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [id],
    }: {
      ctx: { user: User }
      parsedInput: UpdateAutomatedResponseSchema
      bindArgsParsedInputs: UpdateAutomatedResponseBindSchema
    }) => {
      const data = {
        ...parsedInput,
        replies: JSON.stringify(parsedInput.replies),
      }

      await prisma.automatedResponse.update({
        where: {
          id,
        },
        data: data,
      })

      return {
        successful: true,
      }
    },
  )

export const updateStatusAutomatedResponseAction = authActionClient
  .schema(updateStatusAutomatedResponseSchema)
  .bindArgsSchemas(updateAutomatedResponseBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [id],
    }: {
      ctx: { user: User }
      parsedInput: UpdateStatusAutomatedResponseSchema
      bindArgsParsedInputs: UpdateAutomatedResponseBindSchema
    }) => {
      await prisma.automatedResponse.update({
        where: {
          id,
        },
        data: parsedInput,
      })

      return {
        successful: true,
      }
    },
  )
