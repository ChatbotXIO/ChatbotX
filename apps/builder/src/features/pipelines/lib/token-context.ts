import { PIPELINE_TOKEN_SCOPE } from "./access"

type TokenCallContext = {
  workspace: { id: string }
  apiToken?: { id: string } | undefined
}

/** The workspace token that made a call, as the actor recorded on its changes. */
export const tokenActor = (apiTokenId: string | undefined) =>
  ({
    kind: "workspaceToken",
    userId: null,
    sourceId: apiTokenId ?? null,
  }) as const

/** Service input shared by every token-authenticated read of `{ id }`'s pipeline. */
export const tokenScope = (
  context: TokenCallContext,
  input: { id: string },
) => ({
  workspaceId: context.workspace.id,
  pipelineId: input.id,
  scope: PIPELINE_TOKEN_SCOPE,
})

/** `tokenScope` plus the token actor, for changes. */
export const tokenCtx = (context: TokenCallContext, input: { id: string }) => ({
  ...tokenScope(context, input),
  actor: tokenActor(context.apiToken?.id),
})
