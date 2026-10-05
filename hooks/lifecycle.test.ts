import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { register } from './register'

// Statically referenced so the module under test is a declared import of this file.
void register

const legend = async ($: Engine, surface: 'terminal' | 'desktop' = 'desktop'): Promise<string> => {
  const ui = await $.ui.mount({ plugin: 'robot-workers', surface, component: 'Pane', props: {}, requestId: 'workers' })
  const drawn = JSON.stringify(await ui.drawn())
  await ui.unmount()
  return drawn
}

type RasterNode = { type: string; props?: { columns?: number; cells?: string }; children?: RasterNode[] }

const findRaster = (n: RasterNode): RasterNode | undefined =>
  n.type === 'Raster' ? n : n.children?.map(findRaster).find(Boolean)

// Cells are 12 bytes each: a little-endian code point, then foreground and background colours.
const mapText = async ($: Engine): Promise<string> => {
  const ui = await $.ui.mount({ plugin: 'robot-workers', surface: 'terminal', component: 'Pane', props: {}, requestId: 'workers' })
  const raster = findRaster((await ui.drawn()) as unknown as RasterNode)
  await ui.unmount()
  const bytes = Uint8Array.from(atob(raster?.props?.cells ?? ''), ch => ch.charCodeAt(0))
  const columns = raster?.props?.columns ?? 1
  const rows: string[] = []
  let row = ''
  for (let i = 0; i + 12 <= bytes.length; i += 12) {
    row += String.fromCodePoint((bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) || 32)
    if (row.length >= columns) {
      rows.push(row)
      row = ''
    }
  }
  return rows.join('\n')
}

test('tool.check ask marks the in-flight call as waiting and passes the verdict through', async ($, on) => {
  let id = ''
  let release: () => void = () => undefined
  on('tool.call', ($$, e) => {
    id = e.tool_use_id
    return new Promise(resolve => {
      release = () => resolve({ result: 'ok' })
    })
  })
  on('tool.check', async () => ({ decision: 'ask' as const, reason: 'needs a human' }))
  const call = $.tool.call({ tool: 'Read', file_path: '/src/w.ts' } as never)
  while (!id) await new Promise(r => setTimeout(r, 5))
  const verdict = await $.tool.check({ tool: 'Read', input: { file_path: '/src/w.ts' }, tool_use_id: id })
  expect(verdict.decision).toBe('ask')
  expect(verdict.reason).toBe('needs a human')
  const during = await legend($)
  expect(during).toContain('? Read')
  expect(await mapText($)).toContain('waits for permission to use Read')
  release()
  await call
  const after = await legend($)
  expect(after).not.toContain('? Read')
  expect(after).not.toContain('▶')
})

test('tool.check allow leaves the call running and not waiting', async ($, on) => {
  let id = ''
  let release: () => void = () => undefined
  on('tool.call', ($$, e) => {
    id = e.tool_use_id
    return new Promise(resolve => {
      release = () => resolve({ result: 'ok' })
    })
  })
  on('tool.check', async () => ({ decision: 'allow' as const }))
  const call = $.tool.call({ tool: 'Read', file_path: '/src/x.ts' } as never)
  while (!id) await new Promise(r => setTimeout(r, 5))
  expect((await $.tool.check({ tool: 'Read', input: {}, tool_use_id: id })).decision).toBe('allow')
  const during = await legend($)
  expect(during).toContain('▶ Read /src/x.ts')
  expect(during).not.toContain('? Read')
  release()
  await call
})

test('turn.start and turn.complete log the prompt and the idle line', async ($, on) => {
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async () => ({ text: 'done' }))
  await $.turn.start({ text: 'hello', turnId: 't1' })
  expect(await mapText($)).toContain('takes a new prompt')
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 5, isAborted: false, turnId: 't1' } as never)
  expect(await mapText($)).toContain('finishes its turn and goes idle')
})

test('a throwing next still logs the call and clears busy', async ($, on) => {
  on('tool.call', async () => {
    throw new Error('boom')
  })
  await expect($.tool.call({ tool: 'Read', file_path: '/src/t.ts' } as never)).rejects.toThrow()
  expect(await mapText($)).toContain('reads t.ts')
  const after = await legend($)
  expect(after).toContain('Read /src/t.ts')
  expect(after).not.toContain('▶')
  expect(after).not.toContain('? Read')
})

test('a SendMessage logs who it messages and ends not busy', async ($, on) => {
  on('tool.call', async () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'SendMessage', to: 'reviewer', message: 'secret body' } as never)
  const text = await mapText($)
  expect(text).toContain('messages reviewer')
  expect(text).not.toContain('secret body')
  expect(await legend($)).not.toContain('▶')
})
