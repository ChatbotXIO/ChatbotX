"use server"

import { type SettingSchema, settingSchema } from "@/features/settings/schema"
import { actionClient } from "@/lib/safe-action"
import { returnValidationErrors } from "next-safe-action"
import { revalidatePath } from "next/cache"

const settings: SettingSchema = {}

export async function getSettings() {
  return settings
}

async function updateSettings(payload: SettingSchema) {
  return payload
}

export const updateSettingsAction = actionClient
  .inputSchema(settingSchema)
  .action(async ({ parsedInput }) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))

    if (parsedInput.content === "bad word") {
      returnValidationErrors(settingSchema, {
        content: {
          _errors: ["The bad word is not allowed, please remove it"],
        },
      })
    }

    await updateSettings(parsedInput)

    revalidatePath("/settings")

    return {
      successful: true,
      content: parsedInput,
    }
  })
