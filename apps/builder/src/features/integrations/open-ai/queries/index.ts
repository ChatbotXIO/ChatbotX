export const getOpenAIIntegration = async ({
  chatbotId,
}: { chatbotId: string }): Promise<{
  data: Record<string, string | boolean> | null
}> => {
  return {
    data: {
      isConnect: true,
    },
  }
}

export const getOpenAIPrompt = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{
  data: Record<
    string,
    string | boolean | number | string[] | Record<string, string | number>[]
  > | null
  status: string
}> => {
  return {
    data: {
      assistantId: 0,
      max_tokens: 200,
      functions: ["1"],
      model: "gpt-4o-mini",
      promptId: 0,
      systemMessage: "You are a helpful assistant.",
      temperature: 0.5,
      models: [
        {
          id: "gpt-4o-mini",
          name: "GPT-4o mini",
          maxlength: 375000,
        },
        {
          id: "gpt-3.5-turbo",
          name: "GPT-3.5 Turbo 16K",
          maxlength: 48000,
        },
        {
          id: "gpt-4o",
          name: "GPT-4o",
          maxlength: 375000,
        },
        {
          id: "gpt-4",
          name: "GPT-4",
          maxlength: 24000,
        },
        {
          id: "gpt-4-turbo",
          name: "GPT-4 Turbo",
          maxlength: 375000,
        },
        {
          id: "gpt-4-turbo-preview",
          name: "GPT-4 Turbo Preview",
          maxlength: 375000,
        },
        {
          id: "chatgpt-4o-latest",
          name: "chatgpt-4o-latest",
          maxlength: 12000,
        },
        {
          id: "o1-preview",
          name: "o1-preview",
          maxlength: 375000,
        },
        {
          id: "o1-mini",
          name: "o1-mini",
          maxlength: 375000,
        },
      ],
    },
    status: "ok",
  }
}

export const getOpenAIAgents = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{
  data: Record<string, string | number>[] | []
  status: string
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
    status: "ok",
  }
}

export const getOpenAIAssistants = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{ data: Record<string, string>[] | []; status: string }> => {
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
    status: "ok",
  }
}

export const getOpenAIPromptByID = async ({
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

export const createNewPrompt = async (payload: Record<string, string>) => {
  return {
    data: {},
    status: "ok",
  }
}
