"use server"

import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"
import {
  resumeMarketingMessage,
  sendMarketingMessage,
  stopMarketingMessage,
} from "../lib/campaign-operations"

type ControlArgs = {
  ctx: { workspace: WorkspaceModel }
  bindArgsParsedInputs: readonly [string, string]
}

/** Stopping only ever stops work, so it stays available after trial expiry. */
export const stopMarketingMessageAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({ ctx, bindArgsParsedInputs: [, id] }: ControlArgs) =>
      await stopMarketingMessage({ workspace: ctx.workspace, id }),
  )

export const resumeMarketingMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({ ctx, bindArgsParsedInputs: [, id] }: ControlArgs) =>
      await resumeMarketingMessage({ workspace: ctx.workspace, id }),
  )

export const sendMarketingMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({ ctx, bindArgsParsedInputs: [, id] }: ControlArgs) =>
      await sendMarketingMessage({ workspace: ctx.workspace, id }),
  )
