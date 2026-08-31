"use server"

import { workspaceApiTokenService } from "@chatbotx.io/business"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { hashToken } from "@/features/integration-api/lib/token-hash"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateWorkspaceTokenRequest,
  updateWorkspaceTokenRequest,
} from "../schema/action"

// The browser mints the token (`${workspaceId}.` + 43 base64url chars from a
// CSPRNG — see manage-access-token.tsx), so the server must enforce the shape
// here: without a suffix floor, a caller invoking this action directly could
// persist a short, brute-forceable value as a fully trusted API credential.
const TOKEN_SUFFIX_PATTERN = /^[A-Za-z0-9_-]{32,}$/

const isValidTokenFormat = (workspaceId: string, token: string): boolean =>
  token.startsWith(`${workspaceId}.`) &&
  TOKEN_SUFFIX_PATTERN.test(token.slice(workspaceId.length + 1))

const updateWorkspaceToken = async ({
  workspaceId,
  token,
}: {
  workspaceId: string
  token: string
}) => {
  if (!isValidTokenFormat(workspaceId, token)) {
    return returnValidationErrors(updateWorkspaceTokenRequest, {
      _errors: ["Validation Exception"],
      token: {
        _errors: ["Token format is not valid"],
      },
    })
  }

  // Only the digest is persisted — the plaintext token exists solely in the
  // client that generated it, so this save is the user's one chance to copy it.
  await workspaceApiTokenService.replaceToken({
    workspaceId,
    tokenHash: await hashToken(token),
  })
}

export const updateWorkspaceTokenAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateWorkspaceTokenRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: UpdateWorkspaceTokenRequest
    }) => {
      await updateWorkspaceToken({ workspaceId, token: parsedInput.token })
    },
  )
