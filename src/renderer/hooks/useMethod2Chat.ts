import { useCallback, useState } from 'react'
import type React from 'react'

export type Method2Citation = {
  document_id: string
  filename: string
  location: string
  excerpt: string
  score: number
}

export type Method2ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  citations?: Method2Citation[]
  grounded?: boolean
}

type UseMethod2ChatOptions = {
  apiBase: string
  workspaceId: string
  calculationContext: unknown
}

export function useMethod2Chat({
  apiBase,
  workspaceId,
  calculationContext,
}: UseMethod2ChatOptions) {
  const [messages, setMessages] = useState<Method2ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null)

  const removeDocumentCitations = useCallback((documentId: string) => {
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        citations: message.citations?.filter(
          (citation) => citation.document_id !== documentId,
        ),
      })),
    )
    setExpandedCitation(null)
  }, [])

  async function sendMessage(e?: React.FormEvent, promptOverride?: string) {
    if (e) e.preventDefault()
    const message = (promptOverride ?? input).trim()
    if (!message) return

    setMessages((current) => [...current, { role: 'user', content: message }])
    if (!promptOverride) setInput('')
    setChatLoading(true)

    try {
      const response = await fetch(`${apiBase}/method2-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          message,
          calculation_context: calculationContext,
          messages: messages.slice(-6).map(({ role, content }) => ({ role, content })),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.detail ? String(data.detail) : response.statusText)
      }
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: typeof data.reply === 'string' ? data.reply : 'No reply returned.',
          citations: Array.isArray(data.citations) ? data.citations : [],
          grounded: data.grounded === true,
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  return {
    chatLoading,
    chatOpen,
    expandedCitation,
    input,
    messages,
    removeDocumentCitations,
    sendMessage,
    setChatOpen,
    setExpandedCitation,
    setInput,
  }
}
