"use client"

import { createContext, useContext } from "react"

/**
 * The channel of the node whose button the editor dialog is editing, so a
 * step editor inside it (e.g. Call Phone Number's fallback hint) can follow
 * channel rules. `undefined` outside the dialog or for a node with no channel.
 */
export const ButtonEditorChannelContext = createContext<string | undefined>(
  undefined,
)

export const useButtonEditorChannel = (): string | undefined =>
  useContext(ButtonEditorChannelContext)
