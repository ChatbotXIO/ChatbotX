import type { Argv } from "yargs"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { setConfig } from "./commands/config"
import {
  createTag,
  deleteTag,
  listTags,
  showTag,
  showTagByName,
  updateTag,
} from "./commands/tags"

type GlobalArgs = {
  apiKey?: string
  apiUrl?: string
}

type ConfigSetArgs = {
  apiKey: string
}

const main = async (): Promise<void> => {
  await yargs(hideBin(process.argv))
    .scriptName("chatbotX")
    .usage("$0 <command> [options]")
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
    .command(
      "config:set",
      "Set or update API key",
      (cli: Argv<GlobalArgs>) =>
        cli.option("apiKey", {
          describe: "ChatbotX API key",
          type: "string",
          demandOption: true,
        }),
      (argv) => {
        setConfig(argv as Parameters<typeof setConfig>[0] & ConfigSetArgs)
      },
    )
    .command(
      "tags:list",
      "List all tags",
      (cli: Argv<GlobalArgs>) =>
        cli.option("name", {
          describe: "Filter tags by name",
          type: "string",
        }),
      listTags,
    )
    .command(
      "tags:create",
      "Create a new tag",
      (cli: Argv<GlobalArgs>) =>
        cli.option("name", {
          describe: "Tag name",
          type: "string",
          demandOption: true,
        }),
      async ({ name }) => {
        await createTag(name)
      },
    )
    .command(
      "tags:show",
      "Show details for a tag",
      (cli: Argv<GlobalArgs>) =>
        cli.option("id", {
          describe: "Tag ID",
          type: "string",
          demandOption: true,
        }),
      async ({ id }) => {
        await showTag(id)
      },
    )
    .command(
      "tags:show-by-name",
      "Show details for a tag by name",
      (cli: Argv<GlobalArgs>) =>
        cli.option("name", {
          describe: "Tag name",
          type: "string",
          demandOption: true,
        }),
      async ({ name }) => {
        await showTagByName(name)
      },
    )
    .command(
      "tags:update",
      "Update details for a tag",
      (cli: Argv<GlobalArgs>) =>
        cli
          .option("id", {
            describe: "Tag ID",
            type: "string",
            demandOption: true,
          })
          .option("name", {
            describe: "New tag name",
            type: "string",
            demandOption: true,
          }),
      async ({ id, name }) => {
        await updateTag(id, name)
      },
    )
    .command(
      "tags:delete",
      "Delete a tag",
      (cli: Argv<GlobalArgs>) =>
        cli.option("id", {
          describe: "Tag ID",
          type: "string",
          demandOption: true,
        }),
      async ({ id }) => {
        await deleteTag(id)
      },
    )
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
