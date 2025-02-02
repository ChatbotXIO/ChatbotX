export const getAgents = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{
  data: { id: string; name: string; update_at: string }[]
  pageCount: number
}> => {
  return {
    data: [
      {
        id: "216069",
        name: "test 12434",
        update_at: "1737384900",
      },
      {
        id: "314278",
        name: "hehehe",
        update_at: "0",
      },
      {
        id: "433518",
        name: "prompt-1",
        update_at: "1731400480",
      },
      {
        id: "974574",
        name: "Agent-1",
        update_at: "0",
      },
    ],
    pageCount: 1,
  }
}

export const getAgentById = async ({
  id,
}: { id: string }): Promise<{
  data: Record<
    string,
    string | Record<string, string | Record<string, string>[]>
  >
  status: string
}> => {
  return {
    data: {
      id: "816038",
      json_builder: {
        messages: [],
        system: "You are a helpful assistant.",
      },
      name: "11232132",
    },
    status: "ok",
  }
}
