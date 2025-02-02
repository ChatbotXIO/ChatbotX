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
