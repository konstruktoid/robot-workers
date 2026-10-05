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

test('a Read puts the file in the world and busy follows the call', async ($, on) => {
  let during = ''
  on('tool.call', async () => {
    during = await legend($)
    return { result: 'ok' }
  })
  await $.tool.call({ tool: 'Read', file_path: '/src/a.ts' } as never)
  expect(during).toContain('▶ Read /src/a.ts')
  const after = await legend($)
  expect(after).toContain('· Read /src/a.ts')
  expect(after).not.toContain('▶')
})

test('busy clears when next throws', async ($, on) => {
  on('tool.call', async () => {
    throw new Error('boom')
  })
  await $.tool.call({ tool: 'Read', file_path: '/src/b.ts' } as never).catch(() => undefined)
  const after = await legend($)
  expect(after).toContain('Read /src/b.ts')
  expect(after).not.toContain('▶')
})

test('parallel calls keep the robot busy until the last finishes', async ($, on) => {
  const gates: (() => void)[] = []
  on('tool.call', () => new Promise(resolve => gates.push(() => resolve({ result: 'ok' }))))
  const first = $.tool.call({ tool: 'Read', file_path: '/src/a.ts' } as never)
  const second = $.tool.call({ tool: 'Read', file_path: '/src/b.ts' } as never)
  while (gates.length < 2) await new Promise(r => setTimeout(r, 5))
  expect(await legend($)).toContain('▶')
  gates[0]()
  await first
  expect(await legend($)).toContain('▶')
  gates[1]()
  await second
  expect(await legend($)).not.toContain('▶')
})

test('a SendMessage records a link and no file', async ($, on) => {
  on('tool.call', async () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'SendMessage', to: 'reviewer', message: 'hi' } as never)
  const drawn = await legend($)
  expect(drawn).toContain('SendMessage reviewer')
})

test('the terminal pane draws the map without the text legend once a tool has run', async ($, on) => {
  on('tool.call', async () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'Read', file_path: '/src/widget.ts' } as never)
  const drawn = await legend($, 'terminal')
  expect(drawn).toContain('"Raster"')
  expect(drawn).not.toContain('Read /src/widget.ts')
})

test('the map takes exactly the rows and columns of the pane body', async $ => {
  const props = { title: 'Workshop', isFocused: false, bodyColumns: 84, placement: 'dock', scroll: { bodyRows: 31 } }
  const ui = await $.ui.mount({ plugin: 'robot-workers', surface: 'terminal', component: 'Pane', props: props as never, requestId: 'workers' })
  const drawn = JSON.stringify(await ui.drawn())
  await ui.unmount()
  expect(drawn).toContain('"columns":84')
  expect(drawn).toContain('"rows":31')
})

test('a pane body too short for one row of desks gets the smallest map that still holds one', async $ => {
  const props = { title: 'Workshop', isFocused: false, bodyColumns: 84, placement: 'dock', scroll: { bodyRows: 8 } }
  const ui = await $.ui.mount({ plugin: 'robot-workers', surface: 'terminal', component: 'Pane', props: props as never, requestId: 'workers' })
  const drawn = JSON.stringify(await ui.drawn())
  await ui.unmount()
  expect(drawn).toContain('"rows":23')
})
