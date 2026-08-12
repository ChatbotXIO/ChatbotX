import type {
  Context,
  Handler,
  Oauth2AuthValue,
  Oauth2Config,
} from "@chatbotx.io/sdk"

export type ThreadsConfig = Oauth2Config & {
  version: string
  stateParams: {
    workspaceId?: string
    referer?: string
    reconnectIntegrationId?: string
  }
}

export type ThreadsAuthValue = Oauth2AuthValue & {
  metadata: {
    threadsUserId: string
    username: string
    version: string
  }
}

export type ThreadsProfile = {
  id: string
  username: string
  name: string
  threads_profile_picture_url?: string
}

export type ThreadsActions<IAuth extends ThreadsAuthValue = ThreadsAuthValue> =
  {
    getProfile: Handler<{ ctx: Context<IAuth> }, ThreadsProfile>
  }
