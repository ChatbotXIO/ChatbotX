declare const window: {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  __ENV?: any
}

export const getRuntimeVariable = (key: string, defaultValue?: string) => {
  if (typeof window !== "undefined")
    return window.__ENV ? (window.__ENV[key] ?? defaultValue) : undefined
  if (typeof process === "undefined") return undefined
  return process.env[key] ?? defaultValue
}
