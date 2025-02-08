export interface IConversation {
  id: string
  name: string
}

export interface IContact {
  id: string
  phoneNumber: string
}

export interface IAuth {
  type: "oauth"
  accessToken: string
  refreshToken: string
  metadata: {
    botPhoneId: string
  }
}

export interface IMessage {
  id: string
  content: string
}
