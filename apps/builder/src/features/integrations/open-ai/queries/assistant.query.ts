export const getAssistants = async ({
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
        id: "180897",
        name: "Trợ lý",
        update_at: "1731320808",
      },
      {
        id: "668865",
        name: "AI TL",
        update_at: "1735146611",
      },
    ],
    pageCount: 1,
  }
}

export const getAssistantById = async ({
  id,
}: { id: string }): Promise<{
  data: Record<
    string,
    | string
    | number
    | Record<
        string,
        | string
        | number
        | boolean
        | null
        | string[]
        | Record<string, string | boolean>
      >
    | null
    | undefined
  >
  status: string
}> => {
  return {
    data: {
      id: "1067356",
      name: "dddd",
      external_id: "asst_UMKktMjnElmhtd29Jm6Ab1SG",
      json_builder: {
        version: "3",
        name: "dddd",
        model: "gpt-3.5-turbo",
        description: null,
        temperature: 1,
        instructions: "You are a helpful assistant.eeeeee",
        file_ids: [],
        functions: ["1"],
        autoVoice: {
          enable: true,
          voice: "alloy",
        },
      },
      version: "3",
      vector_store_id: "",
    },
    status: "ok",
  }
}
