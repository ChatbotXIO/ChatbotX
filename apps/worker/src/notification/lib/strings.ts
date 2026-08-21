const strings = {
  en: {
    newMessage: "New message",
    sharedLocation: "Shared a location",
    sentLink: "Sent a link",
    sentAttachment: "Sent an attachment",
    sentAttachments: (count: number) => `Sent ${count} attachments`,
    assignedConversation: "You were assigned a conversation",
  },
} as const

type Locale = keyof typeof strings

const resolveLocale = (language: string | undefined): Locale =>
  language && language in strings ? (language as Locale) : "en"

export const t = (language: string | undefined) =>
  strings[resolveLocale(language)]
