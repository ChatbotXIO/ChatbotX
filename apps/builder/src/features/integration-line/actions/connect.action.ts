"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { redirect } from "next/navigation"
import { authActionClient } from "@/lib/safe-action"
import { connectLine } from "../lib/connect-line"
import {
  type ConnectLineActionRequest,
  connectLineActionRequest,
  type LineConnectErrorCode,
  lineConnectErrorCodes,
} from "../schema/action"

const isLineConnectErrorCode = (code: string): code is LineConnectErrorCode =>
  (lineConnectErrorCodes as readonly string[]).includes(code)

export const connectLineAction = authActionClient
  .inputSchema(connectLineActionRequest)
  .action(
    async ({
      parsedInput,
      ctx,
    }: {
      parsedInput: ConnectLineActionRequest
      ctx: { user: Parameters<typeof connectLine>[0]["user"] }
    }) => {
      try {
        const result = await connectLine({
          workspaceId: parsedInput.workspaceId ?? undefined,
          user: ctx.user,
          channelId: parsedInput.channelId,
          channelSecret: parsedInput.channelSecret,
        })
        return {
          errorCode: null,
          workspaceId: result.workspaceId,
          webhook: result.webhook,
        }
      } catch (error) {
        if (error instanceof ChatbotXException) {
          if (error.code === "channelDuplicated" && parsedInput.workspaceId) {
            redirect(
              `/space/${parsedInput.workspaceId}/settings/channels?channel=line&error=duplicated`,
            )
          }
          // Typed, user-fixable failures are returned so the UI can show
          // translated copy; everything else keeps the safe-action path.
          if (isLineConnectErrorCode(error.code)) {
            return { errorCode: error.code, workspaceId: null, webhook: null }
          }
        }
        throw error
      }
    },
  )
