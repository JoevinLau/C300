import { useState } from 'react'
import { ArrowLeft, Leaf, UploadCloud } from 'lucide-react'

import { AppBackground } from '@/components/AppBackground'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Message = { role: 'user' | 'assistant'; content: string }

export default function Method2Page() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null)
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
      const errMsg: Message = { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}` }
      setMessages((m) => [...m, errMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppBackground>
      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-4xl gap-4 lg:grid-cols-[15rem_1fr]">
        <aside className="rounded-lg bg-zinc-950 p-5 text-white">
          <Button
            variant="ghost"
            className="-ml-2 mb-8 text-zinc-300 hover:bg-white/10 hover:text-white"
            onClick={() => {
              window.location.hash = ''
            }}
          >
            <ArrowLeft />
            Back
          </Button>

          <div className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-lime-300 text-zinc-950 shadow-sm">
              <Leaf className="size-6" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Method 2 — Chat</h1>
            <p className="text-sm leading-6 text-zinc-300">Estimate emissions using activity data; ask the assistant for guidance.</p>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-4 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.9)]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-400 text-zinc-950 shadow-sm">
                  <UploadCloud className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Upload spreadsheet</p>
                  <p className="text-sm text-zinc-400">Add an Excel file to provide data for the chat assistant.</p>
                </div>
              </div>
              <div className="mt-4 rounded-3xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Spreadsheet file</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label
                    htmlFor="excel-upload"
                    className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-lime-400 px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-lime-300"
                  >
                    <UploadCloud className="mr-2 size-4" />
                    Choose file
                  </label>
                  <span className="truncate text-sm text-zinc-300 sm:text-left">
                    {file ? file.name : 'No file selected'}
                  </span>
                </div>
                <input
                  id="excel-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="hidden"
                />
                <div className="mt-4 rounded-2xl bg-zinc-950 px-3 py-3 text-sm text-zinc-500">
                  Supported formats: <span className="text-zinc-300">.xlsx, .xls</span>. The uploaded spreadsheet will be included in the chat context.
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="grid gap-4 lg:grid-rows-[1fr_auto]">
          <Card className="border-zinc-900/12 bg-white">
            <CardHeader className="border-b border-zinc-900/10 pb-3">
              <CardTitle>A.I Assistant Chat Bot</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex h-[60vh] flex-col gap-3 overflow-y-auto rounded-md border border-zinc-900/10 p-3">
                {messages.length === 0 ? (
                  <div className="m-auto text-center text-sm text-muted-foreground">Ask me something, anything</div>
                ) : (
                  messages.map((m, i) => (
                    <div
                      key={i}
                      className={`max-w-[80%] ${m.role === 'user' ? 'ml-auto bg-lime-50 text-zinc-900' : 'mr-auto bg-lime-300 text-zinc-950'} rounded-md px-3 py-2`}
                    >
                      <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <form onSubmit={sendMessage} className="mt-2 flex w-full flex-col gap-4">
            <div className="flex w-full gap-2">
              <Input
                placeholder="Ask the assistant about activity-based estimation, e.g. 'How do I estimate energy use for machining'?"
                value={input}
                onChange={(e) => setInput((e.target as HTMLInputElement).value)}
                disabled={loading}
              />
              <Button type="submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
        </div>
      </section>
    </AppBackground>
  )
}
