export const MAC_EVENT_TYPE = {
  MESSAGE_IN: 1,
  MESSAGE_OUT: 2,
  REACTION: 3,
} as const

export type MacEventType = (typeof MAC_EVENT_TYPE)[keyof typeof MAC_EVENT_TYPE]
