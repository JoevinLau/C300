import { useCallback, useEffect, useRef, useState } from 'react'
import { requestLocalApi } from '@/lib/local-api'

export type Method2Document = {
  document_id: string
  filename: string
  file_type: string
  content_hash: string
  chunk_count: number
  status: string
  error: string | null
}

type UseMethod2DocumentsOptions = {
  workspaceId: string
  onDocumentDeleted: (documentId: string) => void
}

function getDocumentRequestError(error: unknown) {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Cannot connect to the local API on port 8000. Restart the app or start the FastAPI backend, then retry the upload.'
  }
  return error instanceof Error ? error.message : String(error)
}

export function useMethod2Documents({
  workspaceId,
  onDocumentDeleted,
}: UseMethod2DocumentsOptions) {
  const [documents, setDocuments] = useState<Method2Document[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [documentError, setDocumentError] = useState('')
  const [retryFiles, setRetryFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(
    async (clearExistingError = true) => {
      setDocumentsLoading(true)
      if (clearExistingError) setDocumentError('')
      try {
        const data = await requestLocalApi({
          path: `/rag/documents?workspace_id=${encodeURIComponent(workspaceId)}`,
        })
        setDocuments(Array.isArray(data) ? data : [])
      } catch (error) {
        setDocumentError(getDocumentRequestError(error))
      } finally {
        setDocumentsLoading(false)
      }
    },
    [workspaceId],
  )

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  async function uploadDocuments(files: File[]) {
    if (files.length === 0) return
    setUploading(true)
    setDocumentError('')

    try {
      const data = await requestLocalApi({
        path: '/rag/documents',
        method: 'POST',
        fields: { workspace_id: workspaceId },
        files: await Promise.all(
          files.map(async (file) => ({
            fieldName: 'files',
            name: file.name,
            contentType: file.type || 'application/octet-stream',
            bytes: new Uint8Array(await file.arrayBuffer()),
          })),
        ),
      })
      const results = data && typeof data === 'object' && 'documents' in data && Array.isArray(data.documents)
        ? (data.documents as Method2Document[])
        : []
      const failures = results.filter((document) => document.status === 'error')
      if (failures.length > 0) {
        setRetryFiles(
          files.filter((file) => failures.some((failure) => failure.filename === file.name)),
        )
        setDocumentError(
          failures.map((failure) => `${failure.filename}: ${failure.error}`).join(' '),
        )
      } else {
        setRetryFiles([])
      }
      await loadDocuments(failures.length === 0)
    } catch (error) {
      setRetryFiles(files)
      setDocumentError(getDocumentRequestError(error))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteDocument(documentId: string) {
    setDocumentError('')
    try {
      await requestLocalApi({
        path: `/rag/documents/${encodeURIComponent(documentId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
        method: 'DELETE',
      })
      setDocuments((current) =>
        current.filter((document) => document.document_id !== documentId),
      )
      onDocumentDeleted(documentId)
    } catch (error) {
      setDocumentError(getDocumentRequestError(error))
    }
  }

  return {
    deleteDocument,
    documentError,
    documents,
    documentsLoading,
    fileInputRef,
    retryFiles,
    uploadDocuments,
    uploading,
  }
}
