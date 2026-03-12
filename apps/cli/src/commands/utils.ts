export type CommandArg<TKey extends string> = {
  key: TKey
  description: string
  required: boolean
}

export type CliCommand = {
  name: string
  args: { key: string; description: string; required: boolean }[]
  run: (params: Record<string, string>) => Promise<void>
}

export const toCliCommands = <
  TName extends string,
  TParams extends Record<string, string>,
>(
  commands: Record<
    TName,
    {
      name: string
      args: { key: string; description: string; required: boolean }[]
    }
  >,
  execute: (commandName: TName, params: TParams) => Promise<void>,
): Record<TName, CliCommand> => {
  return Object.fromEntries(
    (Object.keys(commands) as TName[]).map((commandName) => [
      commandName,
      {
        ...commands[commandName],
        run: async (params: Record<string, string>): Promise<void> => {
          await execute(commandName, params as TParams)
        },
      },
    ]),
  ) as Record<TName, CliCommand>
}

export const validateCommandArgs = <TName extends string, TKey extends string>(
  commandName: TName,
  params: Partial<Record<TKey, string>>,
  commands: Record<TName, { args: CommandArg<TKey>[] }>,
): void => {
  const command = commands[commandName]
  for (const arg of command.args) {
    if (arg.required && !params[arg.key]) {
      throw new Error(`${arg.description} is required`)
    }
  }
}

export const printResult = (result: unknown): void => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

export const parseBooleanEnv = (
  value: string | undefined,
): boolean | undefined => {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()

  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true
  }

  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false
  }

  return undefined
}
