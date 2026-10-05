import type { Plugin } from '@opencode-ai/plugin'
import { chmod, lstat, mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute } from 'node:path'

// Writes OpenCode sessions as robot-workers beacons; BEACON.md in the repository is the format both sides follow.

type Activity = {
  tool: string
  target: string
  spot: string
  spotAt: number
  onFile: boolean
  at: number
  busy: boolean
  waiting: boolean
  open: number
  count: number
  thinking: boolean
  inTurn: boolean
}
type Member = { id: string; name: string; type: string; status: string; parentId?: string }
type LogLine = { at: number; who: string; text: string }
type Crew = {
  id: string
  name: string
  agent: string
  seen: number
  activity: Map<string, Activity>
  calls: Map<string, Set<string>>
  roster: Map<string, Member>
  log: LogLine[]
}
type Seat = { crew: Crew; actor: string }
type Info = { id: string; parentID?: string; title?: string; directory?: string }

const MAIN = 'main'
const THINK = 'think'
const BEACON_MS = 1000
const QUIET_MS = 10000
const DROP_MS = 30 * 60 * 1000
const LOG_KEEP = 30
const LOG_SHARE = 6
const LOG_SHARE_MS = 60000
const LABEL_SHARE = 24
const MAX_AGENTS = 32
const MAX_DEPTH = 8
const CAP_SHORT = 64
const CAP_LOG = 120
const CAP_TEXT = 256
const PATH_STATIONS: ReadonlySet<string> = new Set(['read', 'search', 'edit', 'write'])
const TEST_RUNNERS: ReadonlySet<string> = new Set(['pytest', 'jest', 'vitest', 'mocha', 'bats', 'tox', 'molecule', 'rspec', 'phpunit', 'ctest', 'ansible-test', 'ansible-lint'])
const TEST_VERBS: ReadonlySet<string> = new Set(['go', 'cargo', 'npm', 'pnpm', 'yarn', 'bun', 'make', 'deno', 'dotnet', 'mvn', 'gradle'])
const WRAPPERS: ReadonlySet<string> = new Set(['sudo', 'env', 'time', 'timeout', 'nice', 'uv', 'npx', 'bunx', 'pipx', 'poetry', 'run', 'exec', 'python', 'python3', '-m'])

const clean = (text: string, n = CAP_TEXT): string =>
  text.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{M}]/gu, '').slice(0, n)
const clip = (text: string, n: number) => (text.length > n ? text.slice(0, n - 1) + '…' : text)
const base = (path: string) => path.split('/').filter(Boolean).pop() ?? path
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const text = (x: unknown): string => (typeof x === 'string' ? clean(x) : '')
// Beacon file names allow letters, digits and dashes only, and OpenCode ids carry underscores.
const safeId = (id: string): string => id.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 61)

// Mirrors isTestCommand in hooks/scene.ts; keep the two in step.
const isTestCommand = (command: string): boolean =>
  command
    .slice(0, 300)
    .replace(/"[^"]*"|'[^']*'/g, '""')
    .split(/&&|\|\||[;|&\n()]/)
    .some(part => {
      const words = part.trim().split(/\s+/).filter(w => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w))
      const at = words.findIndex(w => !WRAPPERS.has(w) && !w.startsWith('-') && !/^\d+[smh]?$/.test(w))
      const [cmd = '', next = '', third = ''] = words.slice(at < 0 ? words.length : at)
      const name = cmd.split('/').pop() ?? ''
      if (TEST_RUNNERS.has(name)) return true
      const isTest = (word: string) => word === 'test' || word.startsWith('test:')
      if (TEST_VERBS.has(name)) return isTest(next) || (next === 'run' && isTest(third))
      return name === 'claude' && next === 'plugin' && third === 'test'
    })

const spotOf = (tool: string, command: string): string => {
  if (tool === 'read') return 'read'
  if (tool === 'grep' || tool === 'glob' || tool === 'list' || tool === 'codesearch') return 'search'
  if (tool === 'edit' || tool === 'multiedit' || tool === 'patch' || tool === 'apply_patch') return 'edit'
  if (tool === 'write') return 'write'
  if (tool === 'bash') return isTestCommand(command) ? 'test' : 'run'
  if (tool === 'webfetch' || tool === 'websearch') return 'web'
  if (tool === 'task') return 'team'
  return ''
}

// One plain sentence per action; commands, queries and prompts never appear, since logs travel in beacons.
const describe = (tool: string, spot: string, target: string): string => {
  const what = clip(base(target), 40)
  if (spot === 'read') return what ? `reads ${what}` : 'reads a file'
  if (spot === 'search') return what ? `searches ${what}` : 'searches the code'
  if (spot === 'edit') return what ? `edits ${what}` : 'edits a file'
  if (spot === 'write') return what ? `writes ${what}` : 'writes a file'
  if (spot === 'run') return 'runs a command'
  if (spot === 'test') return 'runs the tests'
  if (spot === 'web') return tool === 'websearch' ? 'searches the web' : 'fetches a web page'
  if (spot === 'team') return 'starts a subagent'
  return `uses ${clip(clean(tool, 64), 40)}`
}

const idle = (now: number): Activity => ({
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

// Only the base name of a file travels, and only for the file stations; full paths and commands can hold secrets.
const beaconOf = (crew: Crew, now: number) => {
  const roster = [...crew.roster.values()]
    .filter(m => m.status === 'running')
    .slice(0, MAX_AGENTS)
    .map(m => ({ ...m, name: clip(m.name, LABEL_SHARE) }))
  const listed = new Set(roster.map(m => m.id))
  const activity = Object.fromEntries(
    [...crew.activity]
      .filter(([who, act]) => who === MAIN || listed.has(who) || act.busy || now - act.at <= QUIET_MS)
      .slice(0, MAX_AGENTS)
      .map(([who, act]) => [who, { ...act, target: act.onFile && PATH_STATIONS.has(act.spot) ? clip(base(act.target), CAP_SHORT) : '' }]),
  )
  const log = crew.log.filter(l => now - l.at < LOG_SHARE_MS).slice(-LOG_SHARE)
  return { v: 1, id: crew.id, name: crew.name, agent: crew.agent, at: now, world: { activity, roster, log, links: [] } }
}

const tombstone = (crew: Crew, now: number) => ({
  v: 1,
  id: crew.id,
  name: crew.name,
  at: now,
  ended: true,
  world: { activity: {}, links: [], roster: [], log: [] },
})

// The same folder the Claude Code side creates, refused when relative, a symlink or someone else's.
const sharedDir = async (): Promise<string | undefined> => {
  const config = process.env.CLAUDE_CONFIG_DIR || `${homedir()}/.claude`
  const dir = `${config}/robot-workers/sessions`
  if (!isAbsolute(dir)) return undefined
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const st = await lstat(dir)
  if (st.isSymbolicLink() || !st.isDirectory() || st.uid !== process.getuid?.()) return undefined
  await chmod(dir, 0o700)
  return dir
}

// A reader never sees half a file: each beacon is written beside its name and renamed over it.
const put = async (dir: string, id: string, beacon: object): Promise<void> => {
  const temp = `${dir}/.${id}.tmp`
  await writeFile(temp, JSON.stringify(beacon), { mode: 0o600 })
  await rename(temp, `${dir}/${id}.json`)
}

export const RobotWorkers: Plugin = async ({ client, directory }) => {
  const crews = new Map<string, Crew>()
  const seats = new Map<string, Seat>()
  const pending = new Map<string, Promise<Seat>>()
  const infos = new Map<string, Info>()
  let dir: string | undefined
  let writing = false
  try {
    dir = await sharedDir()
  } catch {
    dir = undefined
  }

  const lookup = async (id: string): Promise<Info> => {
    const known = infos.get(id)
    if (known) return known
    try {
      const got = await client.session.get({ path: { id } })
      const data: unknown = got.data
      if (isRecord(data)) {
        const info = { id, parentID: text(data.parentID) || undefined, title: text(data.title), directory: text(data.directory) }
        infos.set(id, info)
        return info
      }
    } catch {
      // An unknown session is drawn as a session of its own.
    }
    return { id }
  }

  // Root sessions get a desk and a beacon of their own; child sessions sit at their root's desk as subagents.
  const seatOf = (id: string, depth = 0): Promise<Seat> => {
    const known = seats.get(id)
    if (known) return Promise.resolve(known)
    const waiting = pending.get(id) ?? place(id, depth)
    pending.set(id, waiting)
    return waiting.finally(() => pending.delete(id))
  }

  // Events for a new session arrive together, so the first lookup is shared rather than raced into two desks.
  const place = async (id: string, depth: number): Promise<Seat> => {
    const info = await lookup(id)
    let seat: Seat
    if (info.parentID && depth < MAX_DEPTH && info.parentID !== id) {
      const parent = await seatOf(info.parentID, depth + 1)
      const member: Member = { id: safeId(id), name: clip(info.title || 'subagent', LABEL_SHARE), type: 'subagent', status: 'running' }
      if (parent.actor !== MAIN) member.parentId = parent.actor
      parent.crew.roster.set(member.id, member)
      seat = { crew: parent.crew, actor: member.id }
    } else {
      const crew: Crew = {
        id: `oc-${safeId(id)}`,
        name: clip(base(info.directory || directory) || 'opencode', CAP_SHORT),
        agent: 'opencode',
        seen: Date.now(),
        activity: new Map(),
        calls: new Map(),
        roster: new Map(),
        log: [],
      }
      crews.set(crew.id, crew)
      seat = { crew, actor: MAIN }
    }
    seats.set(id, seat)
    return seat
  }

  const change = async (sessionID: unknown, fn: (act: Activity, seat: Seat, now: number) => Activity | void) => {
    if (typeof sessionID !== 'string' || !sessionID) return
    const seat = await seatOf(sessionID)
    const now = Date.now()
    const act = seat.crew.activity.get(seat.actor) ?? idle(now)
    const next = fn(act, seat, now)
    if (next) seat.crew.activity.set(seat.actor, next)
    seat.crew.seen = now
  }

  const log = (seat: Seat, line: string, now: number) => {
    seat.crew.log = [...seat.crew.log, { at: now, who: seat.actor, text: clip(clean(line, CAP_LOG), CAP_LOG) }].slice(-LOG_KEEP)
  }

  const settle = (act: Activity, seat: Seat, now: number): Activity => {
    seat.crew.calls.delete(seat.actor)
    return { ...act, thinking: false, inTurn: false, busy: false, waiting: false, open: 0, at: now }
  }

  const finish = (act: Activity, seat: Seat, callID: string, now: number): Activity => {
    const open = seat.crew.calls.get(seat.actor)
    if (!open?.delete(callID)) return act
    return { ...act, busy: open.size > 0, open: open.size, waiting: open.size > 0 && act.waiting, at: now }
  }

  const beat = async () => {
    if (!dir || writing) return
    writing = true
    try {
      const now = Date.now()
      for (const crew of [...crews.values()]) {
        if (now - crew.seen > DROP_MS) {
          crews.delete(crew.id)
          await put(dir, crew.id, tombstone(crew, now))
        } else {
          await put(dir, crew.id, beaconOf(crew, now))
        }
      }
    } catch {
      // A missed beacon only makes the session look stale to the others for a moment.
    } finally {
      writing = false
    }
  }

  const timer = setInterval(() => void beat(), BEACON_MS)
  timer.unref?.()

  const onEvent = async (type: string, p: Record<string, unknown>) => {
    if (type === 'session.created' || type === 'session.updated') {
      const info = p.info
      if (!isRecord(info) || typeof info.id !== 'string') return
      const id = info.id
      infos.set(id, { id, parentID: text(info.parentID) || undefined, title: text(info.title), directory: text(info.directory) })
      const seat = seats.get(id)
      const member = seat && seat.crew.roster.get(seat.actor)
      if (member && text(info.title)) member.name = clip(text(info.title), LABEL_SHARE)
    } else if (type === 'message.updated') {
      // A user message names the agent it was sent to, so the main robot follows each switch between agents.
      const info = p.info
      if (!isRecord(info) || info.role !== 'user') return
      const agent = clip(text(info.agent), LABEL_SHARE)
      if (!agent || typeof info.sessionID !== 'string' || !info.sessionID) return
      const seat = await seatOf(info.sessionID)
      if (seat.actor === MAIN) seat.crew.agent = agent
    } else if (type === 'session.status') {
      const status = isRecord(p.status) ? p.status.type : undefined
      if (status === 'busy') await change(p.sessionID, (act, _seat, now) => (act.inTurn ? undefined : { ...act, inTurn: true, at: now }))
    } else if (type === 'session.idle') {
      await change(p.sessionID, (act, seat, now) => {
        const member = seat.crew.roster.get(seat.actor)
        if (member) member.status = 'completed'
        if (act.inTurn || act.busy || act.thinking) log(seat, member ? 'finishes its task' : 'finishes its turn and goes idle', now)
        return settle(act, seat, now)
      })
    } else if (type === 'session.error') {
      // The error text can quote a prompt or a provider reply, so the log line names no detail.
      await change(p.sessionID, (act, seat, now) => {
        if (act.inTurn || act.busy || act.thinking) log(seat, 'stops on an error', now)
        return settle(act, seat, now)
      })
    } else if (type === 'session.deleted') {
      const info = p.info
      const seat = isRecord(info) && typeof info.id === 'string' ? seats.get(info.id) : undefined
      if (!seat) return
      const member = seat.crew.roster.get(seat.actor)
      if (member) member.status = 'completed'
      else if (dir && crews.delete(seat.crew.id)) await put(dir, seat.crew.id, tombstone(seat.crew, Date.now()))
    } else if (type === 'message.part.updated') {
      const part = p.part
      if (!isRecord(part)) return
      if (part.type === 'reasoning' && !(isRecord(part.time) && part.time.end)) {
        await change(part.sessionID, (act, _seat, now) =>
          act.thinking ? undefined : { ...act, thinking: true, inTurn: true, spot: THINK, spotAt: now, at: now },
        )
      } else if (part.type === 'tool' && isRecord(part.state) && (part.state.status === 'completed' || part.state.status === 'error')) {
        const callID = part.callID
        if (typeof callID === 'string') await change(part.sessionID, (act, seat, now) => finish(act, seat, callID, now))
      }
    } else if (type === 'permission.updated' || type === 'permission.asked') {
      const what = clip(text(p.type) || text(p.permission) || 'a tool', 40)
      await change(p.sessionID, (act, seat, now) => {
        log(seat, `waits for permission to use ${what}`, now)
        return { ...act, waiting: true }
      })
    } else if (type === 'permission.replied') {
      await change(p.sessionID, act => ({ ...act, waiting: false }))
    }
  }

  return {
    event: async ({ event }) => {
      try {
        const e: unknown = event
        if (isRecord(e) && typeof e.type === 'string' && isRecord(e.properties)) await onEvent(e.type, e.properties)
      } catch {
        // The map is decoration: a failed update never reaches OpenCode.
      }
    },
    'chat.message': async input => {
      try {
        await change(input.sessionID, (act, seat, now) => {
          log(seat, seat.actor === MAIN ? 'takes a new prompt' : 'takes its task', now)
          const member = seat.crew.roster.get(seat.actor)
          if (member) member.status = 'running'
          return { ...act, inTurn: true, at: now }
        })
      } catch {
        // See event.
      }
    },
    'tool.execute.before': async (input, output) => {
      try {
        const tool = clean(input.tool, CAP_SHORT).toLowerCase()
        const args: unknown = output.args
        const a = isRecord(args) ? args : {}
        const spot = spotOf(tool, text(a.command))
        const file = text(a.filePath)
        const target = file || (spot === 'search' ? text(a.path) : '')
        await change(input.sessionID, (act, seat, now) => {
          const open = seat.crew.calls.get(seat.actor) ?? new Set<string>()
          open.add(input.callID)
          seat.crew.calls.set(seat.actor, open)
          log(seat, describe(tool, spot, target), now)
          const moved = spot ? { spot, spotAt: now } : {}
          const busy = { busy: true, open: open.size, count: act.count + 1, thinking: false, inTurn: true }
          return { ...act, ...moved, ...busy, tool, target, onFile: target !== '', at: now }
        })
      } catch {
        // See event.
      }
    },
    'tool.execute.after': async input => {
      try {
        await change(input.sessionID, (act, seat, now) => finish(act, seat, input.callID, now))
      } catch {
        // See event.
      }
    },
    dispose: async () => {
      clearInterval(timer)
      if (!dir) return
      const now = Date.now()
      for (const crew of crews.values()) await put(dir, crew.id, tombstone(crew, now)).catch(() => undefined)
      crews.clear()
    },
  }
}
