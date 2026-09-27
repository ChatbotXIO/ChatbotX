type ToolFixture = {
  name: string
  summary: string
  description?: string
  method?: string
  tags?: string[]
}

export const specWithTools = (tools: ToolFixture[]) => ({
  ok: true,
  headers: { get: () => null },
  json: async () => ({
    servers: [{ url: "https://api.example.com" }],
    paths: Object.fromEntries(
      tools.map((tool) => [
        `/v1/${tool.name}`,
        {
          [(tool.method ?? "get").toLowerCase()]: {
            operationId: tool.name,
            summary: tool.summary,
            description: tool.description,
            tags: tool.tags ?? [],
          },
        },
      ]),
    ),
  }),
})
