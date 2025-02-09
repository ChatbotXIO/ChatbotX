import { IMessage, Integration, SdkException } from "@ahachat.ai/sdk"
import {
  Audio,
  Document,
  Image,
  Location,
  Text,
  Video,
} from "whatsapp-api-js/messages"
import { whatsappClient } from "./client"
import * as outgoing from "./outgoing-message"

export const integration = new Integration({
  name: "whatsapp",
  channels: {
    channel: {
      messages: {
        text: async ({ payload, ...props }) => {
          await outgoing.send({
            ...props,
            message: new Text(payload.content),
          })
        },
        image: async ({ payload, ...props }) => {
          await outgoing.send({
            ...props,
            message: new Image(payload.text),
          })
        },
        markdown: async ({ payload, ...props }) => {
          await outgoing.send({
            ...props,
            message: new Text(payload.text),
          })
        },
        audio: async ({ payload, ...props }) => {
          await outgoing.send({
            ...props,
            message: new Audio(payload.text),
          })
        },
        video: async ({ payload, ...props }) => {
          await outgoing.send({
            ...props,
            message: new Video(payload.text),
          })
        },
        file: async ({ payload, ...props }) => {
          await outgoing.send({
            ...props,
            message: new Document(payload.text),
          })
        },
        location: async ({ payload, ...props }) => {
          await outgoing.send({
            ...props,
            message: new Location(payload.text, payload.text),
          })
        },
        carousel: async ({ payload, ...props }) => {
          // await outgoing.send({
          //   ...props,
          //   message: new Text(payload.text)
          // })
        },
        card: async ({ payload, ...props }) => {
          // await outgoing.send({
          //   ...props,
          //   message: new Text(payload.text)
          // })
        },
        dropdown: async ({ payload, ...props }) => {
          // await outgoing.send({
          //   ...props,
          //   message: new Text(payload.text)
          // })
        },
        choice: async ({ payload, ...props }) => {
          // await outgoing.send({
          //   ...props,
          //   message: new Text(payload.text)
          // })
        },
        bloc: async ({ payload, ...props }) => {
          throw SdkException.methodNotImplemented()
        },
      },
    },
  },
  actions: {},
  // handle: async (props) => {
  //   const { req } = props

  //   // TODO: validate signature
  //   try {
  //     const whatsapp = await whatsappClient(props.auth)
  //     await whatsapp.verifyRequestSignature(req.body)
  //     const data = JSON.parse(req.body) as WhatsAppPayload
  //   }

  // }
})
