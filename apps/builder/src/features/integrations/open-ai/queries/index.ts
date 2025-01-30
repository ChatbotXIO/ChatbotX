import type { Tag } from "@ahachat.ai/database"

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

export const getOpenAIModels = async (): Promise<{
  data: Record<string, string | number>[]
  status: string
}> => {
  return {
    data: [
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
    status: "ok",
  }
}

export const getOpenAITriggers = async (): Promise<{
  data: Record<string, string>[]
  status: string
}> => {
  return {
    data: [
      {
        id: "1",
        page_id: "0",
        name: "connect_user_to_human",
        active: "1",
        description:
          "Allows the user to speak, talk or contact a human agent or team. This function will connect the user to a human agent.",
        final_text:
          "We handed over the conversation to a human agent. We will get back to you as soon as possible.",
        json_builder: "",
      },
    ],
    status: "ok",
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

export const getOpenAIAssistantByID = async ({
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

export const createNewPrompt = async (payload: Record<string, string>) => {
  return {
    data: {},
    status: "ok",
  }
}
