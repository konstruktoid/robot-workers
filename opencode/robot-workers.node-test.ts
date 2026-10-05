import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { RobotWorkers } from './robot-workers.ts'

const ROOT = 'ses_root1'
const CHILD = 'ses_child1'

const start = async () => {
  const config = await mkdtemp(`${tmpdir()}/robot-workers-`)
  process.env.CLAUDE_CONFIG_DIR = config
  const sessions: Record<string, object> = {
    [ROOT]: { id: ROOT, title: 'Fix the login', directory: '/work/ansible-role' },
    [CHILD]: { id: CHILD, parentID: ROOT, title: 'Explore the role tasks and handlers', directory: '/work/ansible-role' },
  }
  const client = { session: { get: async ({ path }: { path: { id: string } }) => ({ data: sessions[path.id] }) } }
  const hooks = await RobotWorkers({ client, directory: '/work/ansible-role' } as never)
  const dir = `${config}/robot-workers/sessions`
  const beacon = async () => {
    await new Promise(r => setTimeout(r, 1200))
    return JSON.parse(await readFile(`${dir}/oc-ses-root1.json`, 'utf8'))
  }
  return { hooks: hooks as Required<typeof hooks>, dir, beacon }
}

test('a tool call puts the root session at its station with only the file name shared', async () => {
  const { hooks, dir, beacon } = await start()
  await hooks['tool.execute.before']({ tool: 'read', sessionID: ROOT, callID: 'c1' }, { args: { filePath: '/work/ansible-role/secrets/vault.yml' } })
  const b = await beacon()
  assert.equal(b.v, 1)
  assert.equal(b.id, 'oc-ses-root1')
  assert.equal(b.name, 'ansible-role')
  assert.deepEqual(Object.keys(b.world).sort(), ['activity', 'links', 'log', 'roster'])
  const act = b.world.activity.main
  assert.deepEqual(Object.keys(act).sort(), ['at', 'busy', 'count', 'inTurn', 'onFile', 'open', 'spot', 'spotAt', 'target', 'thinking', 'tool', 'waiting'])
  assert.equal(act.spot, 'read')
  assert.equal(act.target, 'vault.yml')
  assert.equal(act.busy, true)
  assert.equal(b.world.log.at(-1).text, 'reads vault.yml')
  assert.equal((await stat(dir)).mode & 0o777, 0o700)
  assert.equal((await stat(`${dir}/oc-ses-root1.json`)).mode & 0o777, 0o600)
  await hooks['tool.execute.after']({ tool: 'read', sessionID: ROOT, callID: 'c1', args: {} }, { title: '', output: '', metadata: {} })
  assert.equal((await beacon()).world.activity.main.busy, false)
  await hooks.dispose()
})

test('a command never travels, and a test run goes to the test station', async () => {
  const { hooks, beacon } = await start()
  await hooks['tool.execute.before']({ tool: 'bash', sessionID: ROOT, callID: 'c1' }, { args: { command: 'TOKEN=abc molecule test' } })
  const b = await beacon()
  assert.equal(b.world.activity.main.spot, 'test')
  assert.equal(b.world.activity.main.target, '')
  assert.ok(!JSON.stringify(b).includes('TOKEN'))
  await hooks.dispose()
})

test('a child session sits at its root desk as a subagent and leaves the roster when idle', async () => {
  const { hooks, beacon } = await start()
  await hooks['chat.message']({ sessionID: CHILD }, { message: {} as never, parts: [] })
  let b = await beacon()
  assert.deepEqual(b.world.roster, [{ id: 'ses-child1', name: 'Explore the role tasks …', type: 'subagent', status: 'running' }])
  assert.equal(b.world.log.at(-1).who, 'ses-child1')
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: CHILD } } as never })
  b = await beacon()
  assert.deepEqual(b.world.roster, [])
  assert.equal(b.world.log.at(-1).text, 'finishes its task')
  await hooks.dispose()
})

test('reasoning seats the robot to think and a permission prompt marks it waiting', async () => {
  const { hooks, beacon } = await start()
  const reasoning = { type: 'reasoning', sessionID: ROOT, time: { start: 1 } }
  await hooks.event({ event: { type: 'message.part.updated', properties: { part: reasoning } } as never })
  let act = (await beacon()).world.activity.main
  assert.equal(act.spot, 'think')
  assert.equal(act.thinking, true)
  await hooks.event({ event: { type: 'permission.updated', properties: { type: 'bash', sessionID: ROOT } } as never })
  act = (await beacon()).world.activity.main
  assert.equal(act.waiting, true)
  await hooks.dispose()
})

test('dispose leaves an ended tombstone and nothing else in the folder', async () => {
  const { hooks, dir } = await start()
  await hooks['tool.execute.before']({ tool: 'edit', sessionID: ROOT, callID: 'c1' }, { args: { filePath: '/a/b.ts' } })
  await hooks.dispose()
  assert.deepEqual(await readdir(dir), ['oc-ses-root1.json'])
  const b = JSON.parse(await readFile(`${dir}/oc-ses-root1.json`, 'utf8'))
  assert.equal(b.ended, true)
})

test('a session error ends the turn at once and shares no error text', async () => {
  const { hooks, beacon } = await start()
  await hooks['chat.message']({ sessionID: ROOT }, { message: {} as never, parts: [] })
  const error = { name: 'APIError', data: { message: 'Cannot connect to http://secret-host:11434' } }
  await hooks.event({ event: { type: 'session.error', properties: { sessionID: ROOT, error } } as never })
  const b = await beacon()
  assert.equal(b.world.activity.main.inTurn, false)
  assert.equal(b.world.log.at(-1).text, 'stops on an error')
  assert.ok(!JSON.stringify(b).includes('secret-host'))
  await hooks.dispose()
})
