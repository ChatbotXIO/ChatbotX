import {
  questionnaireService,
  questionnaireSubmissionService,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createQuestionnairePublicRequest,
  duplicateQuestionnairePublicRequest,
  getQuestionnairePublicRequest,
  getQuestionnaireSubmissionPublicRequest,
  getQuestionnaireSubmissionStatsPublicResponse,
  listQuestionnaireSubmissionsPublicRequest,
  listQuestionnaireSubmissionsPublicResponse,
  listQuestionnairesPublicRequest,
  listQuestionnairesPublicResponse,
  questionnairePublicResource,
  questionnaireSubmissionPublicResource,
  renameQuestionnairePublicRequest,
  updateQuestionnairePublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const questionnairesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/questionnaires",
      summary: "List questionnaires",
      description:
        "Use this to find questionnaire ids before inspecting one with `questionnaires.get` or listing submissions with `questionnaires.listSubmissions`. Returns questionnaires in this workspace.",
      tags: ["Questionnaires"],
    })
    .input(listQuestionnairesPublicRequest)
    .output(listQuestionnairesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await questionnaireService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/questionnaires/{id}",
      summary: "Get a questionnaire",
      description:
        "Returns one questionnaire's questions and settings. Use `questionnaires.list` to find its id first.",
      tags: ["Questionnaires"],
    })
    .input(getQuestionnairePublicRequest)
    .output(questionnairePublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await questionnaireService.getForEdit({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/questionnaires",
      summary: "Create a questionnaire",
      description:
        "Adds an empty questionnaire with the given name. Use `questionnaires.update` afterward to add questions.",
      successStatus: 201,
      tags: ["Questionnaires"],
    })
    .input(createQuestionnairePublicRequest)
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => ({
      id: await questionnaireService.create({
        workspaceId: context.workspace.id,
        name: input.name,
      }),
    })),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/questionnaires/{id}",
      summary: "Update a questionnaire",
      description:
        "Replaces an existing questionnaire's questions and settings. Call `questionnaires.get` to inspect current values first.",
      successStatus: 204,
      tags: ["Questionnaires"],
    })
    .input(updateQuestionnairePublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      await questionnaireService.update({
        workspaceId: context.workspace.id,
        id,
        ...data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/questionnaires/{id}",
      summary: "Delete a questionnaire",
      description:
        "Permanently deletes a questionnaire and its submissions. Use `questionnaires.list` to find its id first.",
      successStatus: 204,
      tags: ["Questionnaires"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Questionnaire id. Get it from `questionnaires.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await questionnaireService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
  rename: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/questionnaires/{id}/rename",
      summary: "Rename a questionnaire",
      description:
        "Changes a questionnaire's display name without touching its questions.",
      successStatus: 204,
      tags: ["Questionnaires"],
    })
    .input(renameQuestionnairePublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await questionnaireService.rename({
        workspaceId: context.workspace.id,
        id: input.id,
        name: input.name,
      })
    }),

  duplicate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/questionnaires/{id}/duplicate",
      summary: "Duplicate a questionnaire",
      description:
        "Copies an existing questionnaire's questions and settings into a new questionnaire.",
      successStatus: 201,
      tags: ["Questionnaires"],
    })
    .input(duplicateQuestionnairePublicRequest)
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => ({
      id: await questionnaireService.duplicate({
        workspaceId: context.workspace.id,
        id: input.id,
      }),
    })),

  listSubmissions: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/questionnaires/{id}/submissions",
      summary: "List questionnaire submissions",
      description:
        "Returns submitted answers for a questionnaire. Use `questionnaires.getSubmission` to inspect one in full.",
      tags: ["Questionnaire submissions"],
    })
    .input(listQuestionnaireSubmissionsPublicRequest)
    .output(listQuestionnaireSubmissionsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const { id, ...listInput } = input
      return await questionnaireSubmissionService.list({
        ...listInput,
        workspaceId: context.workspace.id,
        questionnaireId: id,
      })
    }),

  getSubmission: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/questionnaires/{id}/submissions/{submissionId}",
      summary: "Get a questionnaire submission",
      description:
        "Returns one submission's full answers. Use `questionnaires.listSubmissions` to find its id first.",
      tags: ["Questionnaire submissions"],
    })
    .input(getQuestionnaireSubmissionPublicRequest)
    .output(questionnaireSubmissionPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await questionnaireSubmissionService.detail({
          workspaceId: context.workspace.id,
          questionnaireId: input.id,
          submissionId: input.submissionId,
        }),
    ),

  deleteSubmission: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/questionnaires/{id}/submissions/{submissionId}",
      summary: "Delete a questionnaire submission",
      description:
        "Permanently deletes a single submission's answers. Use `questionnaires.listSubmissions` to find its id first.",
      successStatus: 204,
      tags: ["Questionnaire submissions"],
    })
    .input(getQuestionnaireSubmissionPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await questionnaireSubmissionService.deleteSubmission({
        workspaceId: context.workspace.id,
        questionnaireId: input.id,
        submissionId: input.submissionId,
      })
    }),

  getSubmissionStats: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/questionnaires/{id}/submissions/stats",
      summary: "Get questionnaire submission stats",
      description:
        "Returns aggregate submission counts and completion stats for a questionnaire.",
      tags: ["Questionnaire submissions"],
    })
    .input(getQuestionnairePublicRequest)
    .output(getQuestionnaireSubmissionStatsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await questionnaireSubmissionService.dashboard({
          workspaceId: context.workspace.id,
          questionnaireId: input.id,
        }),
    ),
}
