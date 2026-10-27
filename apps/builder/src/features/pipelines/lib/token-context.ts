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

/** The workspace and access scope every token-authenticated service call carries. */
export const tokenWorkspace = (context: TokenCallContext) => ({
  workspaceId: context.workspace.id,
  scope: PIPELINE_TOKEN_SCOPE,
})

/** `tokenWorkspace` plus the token actor, for changes. */
export const tokenWorkspaceCtx = (context: TokenCallContext) => ({
  ...tokenWorkspace(context),
  actor: tokenActor(context.apiToken?.id),
})

/** Service input shared by every token-authenticated read of `{ id }`'s pipeline. */
export const tokenScope = (
  context: TokenCallContext,
  input: { id: string },
) => ({ ...tokenWorkspace(context), pipelineId: input.id })

/** `tokenScope` plus the token actor, for changes. */
export const tokenCtx = (context: TokenCallContext, input: { id: string }) => ({
  ...tokenWorkspaceCtx(context),
  pipelineId: input.id,
})
