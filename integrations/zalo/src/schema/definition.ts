import type { Context, Oauth2AuthValue, Oauth2Config } from "@chatbotx.io/sdk"

export const DEFAULT_VERSION = "v4"

export const ZALO_MESSAGE_METADATA = "SENT_FROM_CHATBOTX"

export type ZaloConfig = Oauth2Config

export type ZaloAuthValue = Oauth2AuthValue & {
  oaId: string
  metadata: {
    oaName: string
  }
}

export type ZaloResponseError = {
  error: number
  message: string
}

export type ZaloUserDetail = {
  user_id: string
  display_name: string
  avatar?: string
  user_gender?: number | string
  user_is_follower?: boolean
  /** The last `dynamic_param` the user reached the OA with (Dynamic URL). */
  dynamic_param?: string
  shared_info?: {
    phone?: string
  }
  tags_and_notes_info?: {
    notes?: string[]
    tag_names?: string[]
  }
}

export type ZaloActions<IAuth extends ZaloAuthValue = ZaloAuthValue> = {
  tagFollower: (props: {
    ctx: Context<IAuth>
    userId: string
    tagName: string
  }) => Promise<{ success: boolean }>
  removeFollowerFromTag: (props: {
    ctx: Context<IAuth>
    userId: string
    tagName: string
  }) => Promise<{ success: boolean }>
  listOaTags: (props: { ctx: Context<IAuth> }) => Promise<string[]>
  removeTag: (props: {
    ctx: Context<IAuth>
    tagName: string
  }) => Promise<{ success: boolean }>
  getUserDetail: (props: {
    ctx: Context<IAuth>
    userId: string
  }) => Promise<ZaloUserDetail>
}
