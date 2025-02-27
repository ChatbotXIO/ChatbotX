import { AuthType } from "@ahachat.ai/sdk"
import { type ILogObj, Logger } from "tslog"
import { integration } from "./integration"

async function main() {
  await integration.actions?.generateText({
    ctx: {
      auth: {
        authType: AuthType.SECRET_TEXT,
        secretText:
          "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",
      },
      logger: new Logger<ILogObj>({ name: "ahachat.ai" }),
    },
    props: {
      model: "gpt-3.5-turbo-instruct",
      userMessage: "dân số việt nam 2024 là bao nhiêu?",
    },
  })
}

;(async () => {
  await main()
})()
