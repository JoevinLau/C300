import { useMemo, useState } from 'react'
import { ArrowLeft, Bot, FileSpreadsheet, Loader2, MessageCircle, Send, UploadCloud } from 'lucide-react'
import * as XLSX from 'xlsx'

import { AppBackground } from '@/components/AppBackground'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Message = { role: 'user' | 'assistant'; content: string }
type PreviewRow = Record<string, string | number | boolean | null>

export default function Method2Page() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const previewColumns = useMemo(() => {
    const keys = new Set<string>()
    previewRows.forEach((row) => {
      Object.keys(row).forEach((key) => keys.add(key))
    })
    return Array.from(keys).slice(0, 8)
  }, [previewRows])

  async function parseSpreadsheet(nextFile: File) {
    setPreviewError(null)
    setPreviewRows([])

    try {
      const data = await nextFile.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheet = workbook.SheetNames[0]
      if (!firstSheet) {
        setPreviewError('No sheets found in this workbook.')
        return
      }

      const rows = XLSX.utils.sheet_to_json<PreviewRow>(workbook.Sheets[firstSheet], {
        defval: '',
      })
      setPreviewRows(rows.slice(0, 8))
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Unable to preview this spreadsheet.')
    }
  }

  function selectFile(nextFile: File | null) {
    setFile(nextFile)
    if (nextFile) {
      void parseSpreadsheet(nextFile)
    } else {
      setPreviewRows([])
      setPreviewError(null)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    selectFile(e.target.files?.[0] ?? null)
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragActive(false)
    selectFile(e.dataTransfer.files?.[0] ?? null)
  }

  async function sendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const message = input.trim()
    if (!message) return

    const userMsg: Message = { role: 'user', content: message }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('message', message)
      if (file) {
        formData.append('excel_file', file)
      }

      const res = await fetch('http://127.0.0.1:8000/method2-chat', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errorDetail =
          data && typeof data === 'object' && 'detail' in data
            ? String((data as { detail: unknown }).detail)
            : res.statusText
        throw new Error(errorDetail || 'Unknown API error')
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: typeof data.reply === 'string' ? data.reply : 'No reply returned from the server.',
      }
      setMessages((m) => [...m, assistantMsg])
    } catch (err) {
      const errMsg: Message = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }
      setMessages((m) => [...m, errMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppBackground>
      <section className="relative z-10 mx-auto grid w-full max-w-[92rem] gap-4 pb-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="rounded-lg bg-zinc-950 p-4 text-white lg:sticky lg:top-4 lg:self-start">
          <Button
            variant="ghost"
            className="-ml-2 mb-8 text-zinc-300 hover:bg-white/10 hover:text-white"
            onClick={() => {
              window.location.hash = ''
            }}
          >
            <ArrowLeft />
            Back to workflows
          </Button>

          <div className="space-y-5">
            <div className="flex size-12 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
              <MessageCircle className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">Activity data</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Method 2</h1>
            </div>
            <p className="text-sm leading-6 text-zinc-300">
              Upload spreadsheet activity data first, then use the assistant for interpretation and emissions guidance.
            </p>

            <div className="mt-8 border-t border-white/10 pt-5">
              <div className="grid gap-2">
                <div className="rounded-md border border-lime-300 bg-lime-300 px-3 py-2.5 text-zinc-950">
                  <p className="text-sm font-medium">1. Upload</p>
                  <p className="text-xs text-zinc-700">Spreadsheet context</p>
                </div>
                <div className="rounded-md border border-white/10 px-3 py-2.5 text-zinc-300">
                  <p className="text-sm font-medium">2. Ask</p>
                  <p className="text-xs text-zinc-400">Assistant review</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,60fr)_minmax(24rem,40fr)] xl:grid-cols-[minmax(0,65fr)_minmax(26rem,35fr)]">
          <main className="space-y-4">
            <div className="rounded-lg border border-zinc-900/12 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Method 2 workspace</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Upload spreadsheet</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-zinc-950 px-4 py-3 text-white">
                    <p className="text-xs text-zinc-400">File</p>
                    <p className="mt-1 max-w-[12rem] truncate font-mono text-lg">{file ? file.name : '-'}</p>
                  </div>
                  <div className="rounded-md bg-lime-200 px-4 py-3 text-lime-950">
                    <p className="text-xs text-lime-950/70">Preview rows</p>
                    <p className="mt-1 font-mono text-lg">{previewRows.length || '-'}</p>
                  </div>
                </div>
              </div>
            </div>

            <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm">
              <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
                    <FileSpreadsheet className="size-5" />
                  </span>
                  <div>
                    <CardTitle>Spreadsheet data</CardTitle>
                    <CardDescription className="text-zinc-300">Drag in an Excel file or choose one from your computer.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 px-5 py-6">
                <label
                  htmlFor="excel-upload"
                  onDragEnter={(e) => {
                    e.preventDefault()
                    setDragActive(true)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragActive(true)
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center transition-colors ${
                    dragActive
                      ? 'border-lime-500 bg-lime-300/10'
                      : 'border-lime-300/35 bg-lime-300/[0.03] hover:border-lime-500/60 hover:bg-lime-50'
                  }`}
                >
                  <span className="flex size-14 items-center justify-center rounded-lg border border-lime-300/30 bg-lime-300/10 text-lime-800">
                    <UploadCloud className="size-7" />
                  </span>
                  <span className="mt-4 text-lg font-semibold text-zinc-950">
                    {file ? file.name : 'Drop your spreadsheet here'}
                  </span>
                  <span className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Supported formats: .xlsx and .xls. The selected file is attached to each assistant request.
                  </span>
                  <span className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-lime-900 bg-lime-600 px-4 text-sm font-semibold text-white shadow-sm">
                    <UploadCloud className="mr-2 size-4" />
                    Choose file
                  </span>
                </label>
                <input
                  id="excel-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="hidden"
                />

                <div className="overflow-hidden rounded-lg border border-zinc-900/12 bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-zinc-900/10 bg-[#faf8f1] px-4 py-3">
                    <div>
                      <p className="font-medium text-zinc-950">File preview</p>
                      <p className="text-sm text-muted-foreground">
                        {file ? 'Showing the first rows from the first sheet.' : 'Upload a spreadsheet to preview its contents.'}
                      </p>
                    </div>
                  </div>

                  {previewError ? (
                    <div className="p-6 text-sm text-red-700">{previewError}</div>
                  ) : previewRows.length > 0 && previewColumns.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[44rem] text-left text-sm">
                        <thead className="bg-zinc-950 text-white">
                          <tr>
                            {previewColumns.map((column) => (
                              <th key={column} className="px-3 py-2 font-medium">
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900/10">
                          {previewRows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="odd:bg-white even:bg-lime-50/40">
                              {previewColumns.map((column) => (
                                <td key={column} className="max-w-[14rem] truncate px-3 py-2 text-muted-foreground">
                                  {String(row[column] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
                      <FileSpreadsheet className="size-10 text-lime-700" />
                      <p className="text-sm text-muted-foreground">No spreadsheet data loaded.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </main>

          <aside className="lg:sticky lg:top-4 lg:self-start">
            <Card className="gap-0 overflow-hidden border-zinc-900/12 bg-white py-0 shadow-sm lg:h-[calc(100vh-4rem)] lg:min-h-[42rem] lg:max-h-[54rem]">
              <CardHeader className="border-b border-zinc-900/10 bg-zinc-950 px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md bg-lime-300 text-zinc-950">
                    <Bot className="size-5" />
                  </span>
                  <div>
                    <CardTitle>AI Assistant</CardTitle>
                    <CardDescription className="text-zinc-300">Contextual help for your uploaded activity data.</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex min-h-[36rem] flex-1 flex-col p-0 lg:min-h-0">
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <div className="mx-auto mt-10 max-w-sm rounded-lg border border-dashed border-lime-300/35 bg-lime-300/[0.03] p-5 text-center text-sm leading-6 text-muted-foreground">
                      Ask the assistant to review columns, explain emissions factors, or help prepare activity-based estimates.
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div
                        key={i}
                        className={`max-w-[88%] rounded-lg px-3 py-2 ${
                          m.role === 'user'
                            ? 'ml-auto bg-lime-100 text-zinc-950'
                            : 'mr-auto bg-zinc-950 text-white'
                        }`}
                      >
                        <div className="whitespace-pre-wrap text-sm leading-6">{m.content}</div>
                      </div>
                    ))
                  )}
                  {loading ? (
                    <div className="mr-auto inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-sm text-white">
                      <Loader2 className="size-4 animate-spin" />
                      Thinking
                    </div>
                  ) : null}
                </div>

                <form onSubmit={sendMessage} className="border-t border-zinc-900/10 bg-[#faf8f1] p-4">
                  <div className="flex gap-2">
                    <Input
                      className="h-12"
                      placeholder="Ask about this file..."
                      value={input}
                      onChange={(e) => setInput((e.target as HTMLInputElement).value)}
                      disabled={loading}
                    />
                    <Button type="submit" size="icon" disabled={loading}>
                      {loading ? <Loader2 className="animate-spin" /> : <Send />}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </AppBackground>
  )
}
