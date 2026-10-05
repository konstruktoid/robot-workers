import { chmod, lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'

const MAIN = 'main'
const CAP_NAME = 64
const CAP_LOG = 120
const CAP_AGENTS = 32
const LOG_SHARE = 6
const LOG_SHARE_MS = 60000
const MAX_BEACON_BYTES = 64 * 1024
const MAX_HOOK_BYTES = 64 * 1024
const PATH_STATIONS = new Set(['read', 'search', 'edit', 'write'])
const SPOTS = new Set([...PATH_STATIONS, 'run', 'test', 'web', 'team', 'think'])
const TEST_RUNNERS = new Set(['pytest', 'jest', 'vitest', 'mocha', 'bats', 'tox', 'molecule', 'rspec', 'phpunit', 'ctest', 'ansible-test', 'ansible-lint'])
const TEST_VERBS = new Set(['go', 'cargo', 'npm', 'pnpm', 'yarn', 'bun', 'make', 'deno', 'dotnet', 'mvn', 'gradle'])
const WRAPPERS = new Set(['sudo', 'env', 'time', 'timeout', 'nice', 'uv', 'npx', 'bunx', 'pipx', 'poetry', 'run', 'exec', 'python', 'python3', '-m'])

const clean = (value, cap = 256) => (typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{M}]/gu, '').slice(0, cap) : '')
const clip = (value, cap) => (value.length > cap ? value.slice(0, cap - 1) + '…' : value)
const safeId = value => clean(value, 128).replace(/[^A-Za-z0-9-]/g, '-').slice(0, 61)
const beaconId = sessionId => `cp-${safeId(sessionId)}`
const base = value => basename(value.replace(/\\/g, '/'))
const record = value => typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
const own = (value, key) => Object.hasOwn(value, key) ? value[key] : undefined
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : 0

const isTestCommand = command =>
  clean(command, 300)
    .replace(/"[^"]*"|'[^']*'/g, '""')
    .split(/&&|\|\||[;|&\n()]/)
    .some(part => {
      const words = part.trim().split(/\s+/).filter(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word))
      const at = words.findIndex(word => !WRAPPERS.has(word) && !word.startsWith('-') && !/^\d+[smh]?$/.test(word))
      const [commandName = '', next = '', third = ''] = words.slice(at < 0 ? words.length : at)
      const name = commandName.split('/').pop() ?? ''
      if (TEST_RUNNERS.has(name)) return true
      const test = word => word === 'test' || word.startsWith('test:')
      if (TEST_VERBS.has(name)) return test(next) || (next === 'run' && test(third))
      return name === 'claude' && next === 'plugin' && third === 'test'
    })

const spotOf = (tool, command) => {
  const name = clean(tool, 64).toLowerCase()
  if (name === 'view' || name === 'read' || name === 'notebookread') return 'read'
  if (name === 'grep' || name === 'rg' || name === 'glob' || name === 'ls' || name === 'list') return 'search'
  if (name === 'edit' || name === 'str_replace_editor' || name === 'apply_patch' || name === 'notebookedit' || name === 'multiedit') return 'edit'
  if (name === 'create' || name === 'write') return 'write'
  if (name === 'bash' || name === 'powershell') return isTestCommand(command) ? 'test' : 'run'
  if (name === 'web_fetch' || name === 'web_search' || name === 'webfetch' || name === 'websearch') return 'web'
  if (name === 'task' || name === 'agent' || name === 'sendmessage') return 'team'
  return ''
}

const targetOf = (args, spot) => {
  if (!PATH_STATIONS.has(spot)) return ''
  const input = record(args)
  const keys = spot === 'search' ? ['path', 'file_path', 'filePath'] : ['file_path', 'filePath', 'notebook_path', 'notebookPath', 'path', 'to']
  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key]) return clip(base(clean(input[key], 1024)), CAP_NAME)
  }
  return ''
}

const activity = now => ({
  tool: '',
  target: '',
  spot: '',
  spotAt: now,
  onFile: false,
  at: now,
  busy: false,
  waiting: false,
  open: 0,
  count: 0,
  thinking: false,
  inTurn: false,
})

const blank = (id, cwd, now) => ({
  v: 1,
  id,
  name: clip(clean(base(cwd) || 'copilot', CAP_NAME), CAP_NAME),
  agent: 'copilot',
  at: now,
  world: { activity: {}, links: [], roster: [], log: [] },
})

const restoredActivity = (value, now) => {
  const source = record(value)
  const spot = clean(own(source, 'spot'), 64)
  return {
    tool: clean(own(source, 'tool'), 64),
    target: clean(own(source, 'target'), CAP_NAME),
    spot: SPOTS.has(spot) ? spot : '',
    spotAt: number(own(source, 'spotAt')) || now,
    onFile: own(source, 'onFile') === true,
    at: number(own(source, 'at')) || now,
    busy: own(source, 'busy') === true,
    waiting: own(source, 'waiting') === true,
    open: Math.max(0, number(own(source, 'open'))),
    count: Math.max(0, number(own(source, 'count'))),
    thinking: own(source, 'thinking') === true,
    inTurn: own(source, 'inTurn') === true,
  }
}

const restoredBeacon = (value, id, cwd, now) => {
  const fallback = blank(id, cwd, now)
  const source = record(value)
  if (own(source, 'v') !== 1 || own(source, 'id') !== id || own(source, 'ended') === true) return fallback
  const world = record(own(source, 'world'))
  if (!Object.keys(world).length) return fallback
  fallback.name = clip(clean(own(source, 'name'), CAP_NAME), CAP_NAME) || fallback.name
  const storedActivity = record(own(world, 'activity'))
  if (Object.hasOwn(storedActivity, MAIN)) fallback.world.activity[MAIN] = restoredActivity(own(storedActivity, MAIN), now)
  const roster = Array.isArray(own(world, 'roster')) ? own(world, 'roster') : []
  fallback.world.roster = roster.slice(0, CAP_AGENTS).flatMap(member => {
    const sourceMember = record(member)
    const memberId = clean(own(sourceMember, 'id'), 128)
    const name = clean(own(sourceMember, 'name'), 64)
    const type = clean(own(sourceMember, 'type'), 64)
    const status = clean(own(sourceMember, 'status'), 32)
    return memberId && name && type && status ? [{ id: memberId, name, type, status }] : []
  })
  const log = Array.isArray(own(world, 'log')) ? own(world, 'log') : []
  fallback.world.log = log.slice(-LOG_SHARE).flatMap(line => {
    const sourceLine = record(line)
    const who = clean(own(sourceLine, 'who'), 128)
    const text = clean(own(sourceLine, 'text'), CAP_LOG)
    const at = number(own(sourceLine, 'at'))
    return who && text && at ? [{ who, text, at }] : []
  })
  return fallback
}

const sharedDir = async () => {
  const config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  const dir = join(config, 'robot-workers', 'sessions')
  if (!isAbsolute(dir)) return undefined
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const stat = await lstat(dir)
  if (stat.isSymbolicLink() || !stat.isDirectory()) return undefined
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) return undefined
  await chmod(dir, 0o700)
  return dir
}

const readBeacon = async (dir, id, cwd, now) => {
  try {
    const file = join(dir, `${id}.json`)
    const stat = await lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BEACON_BYTES) return blank(id, cwd, now)
    const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW)
    const handle = await open(file, flags)
    try {
      const opened = await handle.stat()
      if (!opened.isFile() || opened.size > MAX_BEACON_BYTES) return blank(id, cwd, now)
      const raw = await handle.readFile({ encoding: 'utf8' })
      if (raw.length > MAX_BEACON_BYTES) return blank(id, cwd, now)
      return restoredBeacon(JSON.parse(raw), id, cwd, now)
    } finally {
      await handle.close()
    }
  } catch {
    // A first event has no existing beacon, and an interrupted write starts fresh.
  }
  return blank(id, cwd, now)
}

const writeBeacon = async (dir, beacon) => {
  const file = join(dir, `${beacon.id}.json`)
  const temp = join(dir, `.${beacon.id}.${randomUUID()}.tmp`)
  let created = false
  try {
    const handle = await open(temp, 'wx', 0o600)
    created = true
    try {
      await handle.writeFile(JSON.stringify(beacon))
    } finally {
      await handle.close()
    }
    await chmod(temp, 0o600)
    await rename(temp, file)
    created = false
  } finally {
    if (created) await unlink(temp).catch(() => undefined)
  }
}

const log = (beacon, who, text, now) => {
  const lines = Array.isArray(beacon.world.log) ? beacon.world.log : []
  // Readers keep only the first LOG_SHARE lines, so the beacon holds just the newest ones from the last minute.
  beacon.world.log = [...lines, { at: now, who, text: clip(clean(text, CAP_LOG), CAP_LOG) }]
    .filter(line => now - line.at < LOG_SHARE_MS)
    .slice(-LOG_SHARE)
}

const mainActivity = (beacon, now) => {
  const activities = record(beacon.world.activity)
  const current = record(activities[MAIN])
  const next = { ...activity(now), ...current }
  beacon.world.activity = { ...activities, [MAIN]: next }
  return next
}

const agentId = (name, now) => `agent-${safeId(name || 'subagent')}-${now.toString(36)}`.slice(0, 128)

const startSubagent = (beacon, input, now) => {
  const roster = Array.isArray(beacon.world.roster) ? beacon.world.roster : []
  const name = clip(clean(input.agentDisplayName || input.agentName || 'subagent', 64), 24)
  beacon.world.roster = [...roster.filter(member => member?.status === 'running'), { id: agentId(clean(input.agentName) || name, now), name, type: 'subagent', status: 'running' }].slice(-CAP_AGENTS)
  log(beacon, MAIN, `starts ${name}`, now)
}

const stopSubagent = (beacon, input, now) => {
  const roster = Array.isArray(beacon.world.roster) ? beacon.world.roster : []
  const name = clean(input.agentDisplayName || input.agentName, 64)
  const idPrefix = `agent-${safeId(input.agentName || input.agentDisplayName || 'subagent')}-`
  let stopped = false
  beacon.world.roster = roster.map(member => {
    if (!stopped && member?.status === 'running' && (member.name === name || member.id?.startsWith(idPrefix))) {
      stopped = true
      return { ...member, status: 'completed' }
    }
    return member
  })
  log(beacon, MAIN, 'finishes a subagent task', now)
}

const apply = (beacon, event, input, now) => {
  const act = mainActivity(beacon, now)
  if (event === 'sessionStart') {
    beacon.name = clip(clean(base(input.cwd) || beacon.name, CAP_NAME), CAP_NAME)
  } else if (event === 'sessionEnd') {
    beacon.ended = true
    beacon.world = { activity: {}, links: [], roster: [], log: [] }
  } else if (event === 'userPromptSubmitted') {
    Object.assign(act, { inTurn: true, thinking: true, spot: 'think', spotAt: now, at: now })
    log(beacon, MAIN, 'takes a new prompt', now)
  } else if (event === 'preToolUse') {
    const spot = spotOf(input.toolName, record(input.toolArgs).command)
    const target = targetOf(input.toolArgs, spot)
    Object.assign(act, {
      tool: clean(input.toolName, 64),
      target,
      spot: spot || act.spot,
      spotAt: spot ? now : act.spotAt,
      onFile: target !== '',
      at: now,
      busy: true,
      waiting: false,
      thinking: false,
      inTurn: true,
      open: Math.max(0, Number(act.open) || 0) + 1,
      count: Math.max(0, Number(act.count) || 0) + 1,
    })
    const action = spot === 'read' ? `reads ${target || 'a file'}` :
      spot === 'search' ? `searches ${target || 'the code'}` :
      spot === 'edit' ? `edits ${target || 'a file'}` :
      spot === 'write' ? `writes ${target || 'a file'}` :
      spot === 'test' ? 'runs the tests' :
      spot === 'run' ? 'runs a command' :
      spot === 'web' ? 'uses the web' :
      spot === 'team' ? 'starts a subagent' : `uses ${clean(input.toolName, 40)}`
    log(beacon, MAIN, action, now)
  } else if (event === 'postToolUse' || event === 'postToolUseFailure') {
    const open = Math.max(0, (Number(act.open) || 0) - 1)
    Object.assign(act, { open, busy: open > 0, waiting: false, at: now })
  } else if (event === 'agentStop') {
    Object.assign(act, { thinking: false, inTurn: false, busy: false, waiting: false, open: 0, at: now })
    log(beacon, MAIN, 'finishes its turn and goes idle', now)
  } else if (event === 'errorOccurred') {
    Object.assign(act, { thinking: false, inTurn: false, busy: false, waiting: false, open: 0, at: now })
    log(beacon, MAIN, 'stops on an error', now)
  } else if (event === 'subagentStart') {
    startSubagent(beacon, input, now)
  } else if (event === 'subagentStop') {
    stopSubagent(beacon, input, now)
  }
  beacon.at = now
}

const readInput = async () => new Promise(resolve => {
  let body = ''
  let bytes = 0
  let tooLarge = false
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => {
    bytes += Buffer.byteLength(chunk)
    if (bytes > MAX_HOOK_BYTES) {
      tooLarge = true
      return
    }
    body += chunk
  })
  process.stdin.on('error', () => resolve(undefined))
  process.stdin.on('end', () => resolve(tooLarge ? undefined : body))
})

const main = async () => {
  const event = process.argv[2]
  const raw = await readInput()
  if (typeof raw !== 'string') return
  const input = record(JSON.parse(raw))
  const sessionId = clean(input.sessionId, 128)
  if (!event || !sessionId) return
  const dir = await sharedDir()
  if (!dir) return
  const now = Date.now()
  const id = beaconId(sessionId)
  const beacon = await readBeacon(dir, id, clean(input.cwd, 1024), now)
  apply(beacon, event, input, now)
  await writeBeacon(dir, beacon)
}

main()
  .catch(error => {
    console.error(`robot-workers Copilot hook: ${error instanceof Error ? error.message : 'failed'}`)
  })
  .finally(() => {
    process.stdout.write('{}\n')
  })
