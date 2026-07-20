import assert from 'node:assert/strict'
import test from 'node:test'

import { createMethod2WorkspaceId } from './rag-workspace.ts'


test('creates a distinct RAG workspace for each Method 2 assessment', () => {
  const first = createMethod2WorkspaceId()
  const second = createMethod2WorkspaceId()

  assert.match(first, /^method2-[0-9a-f-]{36}$/)
  assert.match(second, /^method2-[0-9a-f-]{36}$/)
  assert.notEqual(first, second)
})
