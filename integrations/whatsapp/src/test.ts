import { AuthType, FileType, MessageType } from "@ahachat.ai/sdk"
import { type ILogObj, Logger } from "tslog"
import { WhatsAppAPI } from "whatsapp-api-js"
import { DEFAULT_API_VERSION } from "whatsapp-api-js/types"
import { integration } from "."
import { verifyAccesToken } from "./client"

async function test() {
  return await integration.actions?.sendMessage?.({
    payload: {
      // messageType: MessageType.Markdown,
      // content: "**bold**"

      // messageType: MessageType.Image,
      // attachments: [{
      //   fileType: FileType.Image,
      //   fileUrl: "https://hips.hearstapps.com/hmg-prod/images/sacred-lotus-gettyimages-1143403162-646fa5a441f5d.jpg?crop=0.535xw:1.00xh;0.0519xw,0&resize=980:*"
      // }]

      // messageType: MessageType.Video,
      // attachments: [{
      //   fileType: FileType.Video,
      //   fileUrl: "https://www.sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
      // }]

      // messageType: MessageType.Audio,
      // attachments: [{
      //   fileType: FileType.Audio,
      //   fileUrl: "https://www.sample-videos.com/audio/mp3/crowd-cheering.mp3"
      // }]

      messageType: MessageType.File,
      attachments: [
        {
          fileType: FileType.File,
          fileUrl:
            "https://www.sample-videos.com/csv/Sample-Spreadsheet-10-rows.csv",
        },
      ],
    },
    auth: {
      authType: AuthType.OAUTH2,
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      tokens: {
        accessToken:
          "EAAZAx0nD4y7sBO1MHxIHfOibIObZAEmcjsIISELQP8G8UvGOOCR9ostNUexQXskNLx4d75GpHtWrZAyNfr31we4UzF8e8Vppi4L9rWkyNCWFDJrQiuBysYcfalCrIrKZA7YMqd9KbuKpksF9uSmBHh6NIpUqXCKquF4wHmAQGyCced1tnh2gX80auSCYd50ClgeQo6cZC727ZCgmAFdJyQuZCuGJsAW4ca63lgHTQJeUkoZD",
        metadata: {
          wabaId: "529134383616441",
          phoneNumberId: "513345888530969",
        },
      },
    },
    logger: new Logger<ILogObj>(),
    conversation: {
      contact: {
        name: "Truong My",
        phoneNumber: "84905849356",
      },
    },
  })
}
;(async () => {
  try {
    const data = await verifyAccesToken({
      authType: AuthType.OAUTH2,
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      tokens: {
        accessToken:
          "EAAZAx0nD4y7sBO3PJSnsK7ySPNwz26AIpdLl8jofENNa8UOgxeM36vxO4BQaGFlBGZBHLLwYEKBTU1MNZCjUyvpjBgp9f7hvqYnNBUhA1MIivzRvDgCrrAyiJKEPYPx4zQM9L33sr1SpDfTEHp3zS1xTrmPIZCJlZAal5JL9ZBPHH65yYssLCHImsctm7BijIZCNzlezPu5X7sfH2JliWW4MdQ3f7W0sRkyhgZDZD",
      },
      metadata: {
        wabaId: "529134383616441",
      },
    })
    console.log(data)
  } catch (e) {
    console.log("ffffff", e)
    // Deal with the fact the chain failed
  }
})()
