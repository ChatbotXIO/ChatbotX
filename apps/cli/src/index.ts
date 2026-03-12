import type { Argv } from "yargs"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { type CliCommand, toCliCommands } from "./commands/common"
import { setConfig } from "./commands/config"
import {
  type ContactCommandName,
  type ContactCommandParams,
  contactCommands,
  executeContactCommand,
} from "./commands/contacts"
import {
  type CustomFieldCommandName,
  type CustomFieldCommandParams,
  customFieldCommands,
  executeCustomFieldCommand,
} from "./commands/custom-fields"
import {
  executeTagCommand,
  type TagCommandName,
  type TagCommandParams,
  tagCommands,
} from "./commands/tags"
import type { ConfigOptions } from "./config"

const allCommands: Record<string, CliCommand> = {
  ...toCliCommands<TagCommandName, TagCommandParams>(
    tagCommands,
    executeTagCommand,
  ),
  ...toCliCommands<CustomFieldCommandName, CustomFieldCommandParams>(
    customFieldCommands,
    executeCustomFieldCommand,
  ),
  ...toCliCommands<ContactCommandName, ContactCommandParams>(
    contactCommands,
    executeContactCommand,
  ),
}

const groupCommands = (
  commands: Record<string, CliCommand>,
): Record<string, Record<string, CliCommand>> => {
  const grouped: Record<string, Record<string, CliCommand>> = {}
  for (const [key, command] of Object.entries(commands)) {
    const colonIndex = key.indexOf(":")
    const group = key.slice(0, colonIndex)
    const action = key.slice(colonIndex + 1)
    if (!grouped[group]) {
      grouped[group] = {}
    }
    grouped[group][action] = command
  }
  return grouped
}

const registerActionArgs = (actionCli: Argv, command: CliCommand): Argv => {
  let nextCli = actionCli
  for (const arg of command.args) {
    nextCli = nextCli.option(arg.key, {
      describe: arg.description,
      type: "string",
      demandOption: arg.required,
    })
  }
  return nextCli
}

const buildActionHandler =
  (command: CliCommand) =>
  async (argv: Record<string, unknown>): Promise<void> => {
    const params: Record<string, string> = {}
    for (const arg of command.args) {
      const value = argv[arg.key]
      if (typeof value === "string") {
        params[arg.key] = value
      }
    }
    await command.run(params)
  }

const registerGroupCommand = (
  cli: ReturnType<typeof yargs>,
  groupName: string,
  actions: Record<string, CliCommand>,
): void => {
  cli.command(groupName, `${groupName} commands`, (groupCli: Argv) => {
    for (const [actionName, command] of Object.entries(actions)) {
      groupCli.command(
        actionName,
        command.name,
        (actionCli: Argv) => registerActionArgs(actionCli, command),
        async (argv) =>
          buildActionHandler(command)(argv as Record<string, unknown>),
      )
    }
    return groupCli.demandCommand(1, "You need at least one action")
  })
}

const registerConfigCommand = (cli: ReturnType<typeof yargs>): void => {
  cli.command(
    "config",
    "Configuration commands",
    (configCli: Argv<ConfigOptions>) =>
      configCli
        .command(
          "set",
          "Set or update API key and API URL",
          (setCli: Argv<ConfigOptions>) =>
            setCli
              .option("apiKey", {
                describe: "ChatbotX API key",
                type: "string",
              })
              .option("apiUrl", {
                describe: "ChatbotX API URL",
                type: "string",
              })
              .option("allowSelfSignedCert", {
                describe: "Disable TLS cert validation (local dev only)",
                type: "boolean",
              }),
          (argv) => {
            setConfig(argv as Parameters<typeof setConfig>[0] & ConfigOptions)
          },
        )
        .demandCommand(1, "You need at least one action"),
  )
}

const main = async (): Promise<void> => {
  const cli = yargs(hideBin(process.argv))
    .scriptName("chatbotx")
    .usage("$0 <group> <action> [options]")
    .option("apiKey", {
      describe: "ChatbotX API key (global)",
      type: "string",
      global: true,
    })
    .option("apiUrl", {
      describe: "ChatbotX API URL (global)",
      type: "string",
      global: true,
    })
    .option("allowSelfSignedCert", {
      describe: "Disable TLS cert validation (local dev only)",
      type: "boolean",
      global: true,
    })

  registerConfigCommand(cli)

  const groupedCommands = groupCommands(allCommands)
  for (const [groupName, actions] of Object.entries(groupedCommands)) {
    registerGroupCommand(cli, groupName, actions)
  }

  await cli
    .demandCommand(1, "You need at least one command")
    .help()
    .alias("h", "help")
    .version("0.1.0")
    .alias("v", "version")
    .parseAsync()
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error"
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
