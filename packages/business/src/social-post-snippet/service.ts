import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import type { SocialPostSnippetKind } from "@chatbotx.io/database/partials"
import { socialPostSnippetRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"

/** Most snippets one workspace may keep; bounds the picker and the list. */
export const MAX_POST_SNIPPETS_PER_WORKSPACE = 100

const SNIPPET_NAME_UNIQUE_INDEX = "SocialPostSnippet_workspaceId_name_key"
const SIGNATURE_SEPARATOR = "\n\n"

export type PostSnippetItem = {
  content: string
  id: string
  kind: SocialPostSnippetKind
  name: string
  position: number
}

const nameTakenException = () =>
  conflictException(
    "A snippet with this name already exists.",
    "snippetNameTaken",
  )

/**
 * The text a post stores once a signature is appended: the signature on its own
 * line block after the text, or alone when the post has no text.
 */
export const composeSignedText = (
  text: string | null | undefined,
  signature: string,
): string => {
  const body = text?.trimEnd() ?? ""
  return body ? `${body}${SIGNATURE_SEPARATOR}${signature}` : signature
}

class SocialPostSnippetService extends BaseService {
  async list(input: {
    kind?: SocialPostSnippetKind
    workspaceId: string
  }): Promise<{ items: PostSnippetItem[] }> {
    return {
      items: await socialPostSnippetRepository.list({
        ...input,
        limit: MAX_POST_SNIPPETS_PER_WORKSPACE,
      }),
    }
  }

  async get(input: {
    id: string
    workspaceId: string
  }): Promise<PostSnippetItem> {
    const row = await socialPostSnippetRepository.findById(input)
    if (!row) {
      throw notFoundException("Snippet not found.")
    }
    return row
  }

  async create(input: {
    content: string
    kind: SocialPostSnippetKind
    name: string
    workspaceId: string
  }): Promise<PostSnippetItem> {
    // The cap is checked and the row inserted under one workspace lock, so
    // concurrent creates cannot overshoot it.
    return await db.transaction(async (tx) => {
      await socialPostSnippetRepository.lockWorkspaceSnippets(
        input.workspaceId,
        tx,
      )
      const count = await socialPostSnippetRepository.countByWorkspace(
        input.workspaceId,
        tx,
      )
      if (count >= MAX_POST_SNIPPETS_PER_WORKSPACE) {
        throw validationException(
          "name",
          `A workspace can have at most ${MAX_POST_SNIPPETS_PER_WORKSPACE} snippets.`,
        )
      }
      const position = await socialPostSnippetRepository.nextPosition(
        input.workspaceId,
        tx,
      )
      const created = await socialPostSnippetRepository.insert(
        { ...input, position },
        tx,
      )
      if (!created) {
        throw nameTakenException()
      }
      return created
    })
  }

  async update(input: {
    content?: string
    id: string
    kind?: SocialPostSnippetKind
    name?: string
    position?: number
    workspaceId: string
  }): Promise<PostSnippetItem> {
    try {
      const updated = await socialPostSnippetRepository.update(input)
      if (!updated) {
        throw notFoundException("Snippet not found.")
      }
      return updated
    } catch (err) {
      if (isUniqueViolationError(err, SNIPPET_NAME_UNIQUE_INDEX)) {
        throw nameTakenException()
      }
      throw err
    }
  }

  async delete(input: { id: string; workspaceId: string }): Promise<void> {
    const deleted = await socialPostSnippetRepository.delete(input)
    if (!deleted) {
      throw notFoundException("Snippet not found.")
    }
  }

  /**
   * The text of a new post with the chosen signature appended, once. Runs at
   * create time only: the stored text is what gets published, so nothing is
   * appended at publish and an update never re-appends.
   */
  async appendSignature(input: {
    maxLength: number
    signatureId: string
    text: string | null | undefined
    workspaceId: string
  }): Promise<string> {
    const snippet = await socialPostSnippetRepository.findById({
      id: input.signatureId,
      workspaceId: input.workspaceId,
    })
    if (snippet?.kind !== "signature") {
      throw validationException("signatureId", "Signature not found.")
    }
    const signed = composeSignedText(input.text, snippet.content)
    if (signed.length > input.maxLength) {
      throw validationException(
        "text",
        `The text with the signature is longer than ${input.maxLength} characters.`,
      )
    }
    return signed
  }
}

export const socialPostSnippetService = new SocialPostSnippetService()
