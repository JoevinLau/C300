import { useCallback, useState } from 'react'
import type React from 'react'
import { requestLocalApi } from '@/lib/local-api'
import type { Method2Citation } from '../../../shared/backend-capabilities'

export type { Method2Citation } from '../../../shared/backend-capabilities'

export type Method2ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  citations?: Method2Citation[]
  grounded?: boolean
}

type UseMethod2ChatOptions = {
  workspaceId: string
  calculationContext: unknown
}

export function useMethod2Chat({
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
      const request = {
        workspace_id: workspaceId,
        message,
        calculation_context: calculationContext && typeof calculationContext === 'object'
          ? calculationContext as Record<string, unknown>
          : {},
        messages: messages.slice(-6).map(({ role, content }) => ({ role, content })),
      }
      const data = window.electronAPI?.backend
        ? await window.electronAPI.backend.sendMethod2Chat(request)
        : await requestLocalApi({ path: '/method2-chat', method: 'POST', json: request })
      const record = data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : {}
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: typeof record.reply === 'string' ? record.reply : 'No reply returned.',
          citations: Array.isArray(record.citations) ? record.citations as Method2Citation[] : [],
          grounded: record.grounded === true,
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
