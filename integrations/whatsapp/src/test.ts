import { Logger } from "tslog"
import { sendOutgoingMessage } from "./outgoing-message.js"

const main = async () => {
  await sendOutgoingMessage({
    auth: {
      tokens: {
        accessToken: "EAAZAx0nD4y7sBO8KDqZCWsM2SZCjUZAmfAQ9i6hFbQfACU0hcNUoj2p2DNRqXBsoCij3bhS6rQ4VZCfKjsvHWHxxJBlSbqshjekknkQKnuEBtaVCO7woETHBGVSr5OarJ8mGZABdPZA3oixrovk1JB6XKZC7wjwTCZBSkiMQ6eNHtfOtW0gqitEoVcz3ycdGa6qHFOPawNkfD0MXdBaQIRuQSZC4euDVciBsQuZAZAP6kZAEypjEZD"
      },
      appSecret: "7f1232920f5fe5d14bc7a6e3efb5271c",
      v: "v22",
    },
    logger: new Logger
  }, {
    conversationAttributes: {
      phoneNumberId: "513345888530969"
    },
    sourceId: "84335758919"
  }, {
    type: "TEXT",
    content: "my hello 222"
  })
}

(async () => {
  await main()
})()
