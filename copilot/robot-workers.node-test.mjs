import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const writer = fileURLToPath(new URL('./robot-workers.mjs', import.meta.url))

const invoke = async (config, event, payload) => {
  const child = spawn(process.execPath, [writer, event], { env: { ...process.env, CLAUDE_CONFIG_DIR: config } })
  child.stdin.end(JSON.stringify(payload))
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`hook exited ${code}: ${stderr}`)))
  })
  assert.deepEqual(JSON.parse(stdout), {})
}

const invokeRaw = async (config, event, payload) => {
  const child = spawn(process.execPath, [writer, event], { env: { ...process.env, CLAUDE_CONFIG_DIR: config } })
  child.stdin.end(payload)
  let stdout = ''
  child.stdout.on('data', data => { stdout += data })
  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`hook exited ${code}`)))
  })
  assert.deepEqual(JSON.parse(stdout), {})
}

const beacon = async (config, id = 'cp-session-1') =>
  JSON.parse(await readFile(join(config, 'robot-workers', 'sessions', `${id}.json`), 'utf8'))

test('Copilot tool hooks write a sanitized beacon and settle activity', async () => {
  const config = await mkdtemp(join(tmpdir(), 'robot-workers-copilot-'))
  const common = { sessionId: 'session_1', cwd: '/work/ansible-role', timestamp: 1000 }
  await invoke(config, 'sessionStart', common)
  await invoke(config, 'preToolUse', { ...common, timestamp: 1100, toolName: 'view', toolArgs: { path: '/work/ansible-role/group_vars/vault.yml' } })
  let found = await beacon(config)
  assert.equal(found.name, 'ansible-role')
  assert.equal(found.world.activity.main.spot, 'read')
  assert.equal(found.world.activity.main.target, 'vault.yml')
  assert.equal(found.world.activity.main.busy, true)
  assert.ok(!JSON.stringify(found).includes('/work/ansible-role'))
  await invoke(config, 'postToolUse', { ...common, timestamp: 1200, toolName: 'view', toolArgs: {}, toolResult: { resultType: 'success', textResultForLlm: 'secret' } })
  found = await beacon(config)
  assert.equal(found.world.activity.main.busy, false)
  assert.equal((await stat(join(config, 'robot-workers', 'sessions'))).mode & 0o777, 0o700)
  assert.equal((await stat(join(config, 'robot-workers', 'sessions', 'cp-session-1.json'))).mode & 0o777, 0o600)
})

test('Copilot commands and prompts never enter a beacon', async () => {
  const config = await mkdtemp(join(tmpdir(), 'robot-workers-copilot-'))
  const common = { sessionId: 'session-2', cwd: '/work/project', timestamp: 1000 }
  await invoke(config, 'userPromptSubmitted', { ...common, prompt: 'Use TOKEN=top-secret to fix it' })
  await invoke(config, 'preToolUse', { ...common, timestamp: 1100, toolName: 'bash', toolArgs: { command: 'TOKEN=top-secret pytest -q' } })
  const found = await beacon(config, 'cp-session-2')
  assert.equal(found.world.activity.main.spot, 'test')
  assert.equal(found.world.activity.main.target, '')
  assert.equal(found.world.log.at(-1).text, 'runs the tests')
  assert.ok(!JSON.stringify(found).includes('top-secret'))
})

test('Copilot beacons keep only the newest log lines that readers show', async () => {
  const config = await mkdtemp(join(tmpdir(), 'robot-workers-copilot-'))
  const common = { sessionId: 'session-6', cwd: '/work/project', timestamp: 1000 }
  for (let i = 1; i <= 8; i++) {
    await invoke(config, 'preToolUse', { ...common, toolName: 'view', toolArgs: { path: `/work/project/f${i}.txt` } })
  }
  const found = await beacon(config, 'cp-session-6')
  assert.deepEqual(found.world.log.map(line => line.text), ['reads f3.txt', 'reads f4.txt', 'reads f5.txt', 'reads f6.txt', 'reads f7.txt', 'reads f8.txt'])
})

test('Copilot subagents are represented and session end writes a tombstone', async () => {
  const config = await mkdtemp(join(tmpdir(), 'robot-workers-copilot-'))
  const common = { sessionId: 'session-3', cwd: '/work/project', timestamp: 1000 }
  await invoke(config, 'sessionStart', common)
  await invoke(config, 'subagentStart', { ...common, timestamp: 1100, agentName: 'explore', agentDisplayName: 'Explore role tasks' })
  let found = await beacon(config, 'cp-session-3')
  assert.equal(found.world.roster[0].name, 'Explore role tasks')
  assert.equal(found.world.roster[0].status, 'running')
  await invoke(config, 'subagentStop', { ...common, timestamp: 1200, agentId: 'agent-id', agentName: 'explore', response: 'sensitive response' })
  found = await beacon(config, 'cp-session-3')
  assert.equal(found.world.roster[0].status, 'completed')
  assert.ok(!JSON.stringify(found).includes('sensitive response'))
  await invoke(config, 'sessionEnd', { ...common, timestamp: 1300, reason: 'complete' })
  found = await beacon(config, 'cp-session-3')
  assert.equal(found.ended, true)
})

test('oversized hook payloads and symlinked beacon files cannot alter another file', async () => {
  const config = await mkdtemp(join(tmpdir(), 'robot-workers-copilot-'))
  await invokeRaw(config, 'sessionStart', 'x'.repeat(70_000))
  await invoke(config, 'sessionStart', { sessionId: 'session-4', cwd: '/work/project', timestamp: 1 })
  const outside = join(config, 'outside.json')
  await writeFile(outside, '{"keep":true}')
  const dir = join(config, 'robot-workers', 'sessions')
  await writeFile(join(dir, 'cp-session-4.json'), '{"invalid":true}')
  await symlink(outside, join(dir, 'cp-session-5.json'))
  await invoke(config, 'sessionStart', { sessionId: 'session-5', cwd: '/work/project', timestamp: 1 })
  assert.equal(await readFile(outside, 'utf8'), '{"keep":true}')
  const found = await beacon(config, 'cp-session-5')
  assert.equal(found.id, 'cp-session-5')
  assert.equal(found.name, 'project')
})
