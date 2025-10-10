"use server"

// export const duplicateAIAgentAction = authActionClient
//   .bindArgsSchemas(chatbotIdAndIdRequestParams)
//   .action(
//     async ({
//       bindArgsParsedInputs: [chatbotId, id],
//     }: {
//       bindArgsParsedInputs: ChatbotIdAndIdRequestParams
//     }) => {
//       const aiAgent = await prisma.aIAgent.findFirst({
//         where: {
//           id,
//           chatbotId,
//         },
//       })
//       if (!aiAgent) {
//         return {
//           successful: true,
//         }
//       }

//       await prisma.aIAgent.create({
//         data: {
//           name: `${aiAgent.name} _copy`,
//           prompt: aiAgent.prompt,
//           messages: aiAgent.messages as Prisma.InputJsonValue[],
//           chatbotId: aiAgent.chatbotId,
//         },
//       })

//       revalidateTag(`chatbots:${chatbotId}#aiAgents`)
//     },
//   )
