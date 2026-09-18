"use client"

import { Component, type ReactNode } from "react"

type TemplatePreviewBoundaryProps = {
  children: ReactNode
  fallback: ReactNode
}

type TemplatePreviewBoundaryState = {
  hasError: boolean
}

/**
 * Contains a template preview that fails to render (e.g. a synced template
 * whose stored components are malformed), so one broken template shows the
 * fallback instead of taking the whole broadcast detail dialog down.
 */
export class TemplatePreviewBoundary extends Component<
  TemplatePreviewBoundaryProps,
  TemplatePreviewBoundaryState
> {
  state: TemplatePreviewBoundaryState = { hasError: false }

  static getDerivedStateFromError(): TemplatePreviewBoundaryState {
    return { hasError: true }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
