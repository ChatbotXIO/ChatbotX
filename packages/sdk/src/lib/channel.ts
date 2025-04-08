// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type ActionFunction = (...args: any[]) => Promise<void>

export enum MessageType {
  text = "text",
  image = "image",
  markdown = "markdown",
  audio = "audio",
  video = "video",
  file = "file",
  location = "location",
  card = "card",
  carousel = "carousel",
  dropdown = "dropdown",
  choice = "choice",
  bloc = "bloc",
}

// interface MessageDefinition {
//   name: string
//   props: any
//   run: ActionFunction
//   test: ActionFunction
//   requireAuth?: boolean
//   validate?: (args: any[]) => boolean | string
// }

type IntegrationMessage = Record<keyof typeof MessageType, ActionFunction>

type IntegrationChannel = Record<"messages", IntegrationMessage>

// Strong typing for the actions
export type IntegrationChannels = Record<string, IntegrationChannel>
