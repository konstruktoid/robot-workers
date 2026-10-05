import type { Activity, Beacon, Link, LogLine, Member, World } from '../types'

// Everything the map needs that touches no host: shared by the Claude Code pane and the OpenCode workshop view.
export const MAIN = 'main'
export const THINK = 'think'
export const ENDED: ReadonlySet<string> = new Set(['completed', 'failed', 'killed'])
export const isEnded = (status: string): boolean => ENDED.has(status)
export const EMPTY: World = { activity: {}, links: [], roster: [], log: [] }

export type StationKey = 'read' | 'search' | 'edit' | 'write' | 'run' | 'test' | 'web' | 'team'
export type Station = { key: StationKey; label: string; mark: string }

// The front of the room: one station per kind of action, shared by every session, so the map shows no file paths.
export const STATIONS: readonly Station[] = [
  { key: 'read', label: 'read', mark: '▤' },
  { key: 'search', label: 'search', mark: '◎' },
  { key: 'edit', label: 'edit', mark: '▧' },
  { key: 'write', label: 'write', mark: '▦' },
  { key: 'run', label: 'execute', mark: '▶' },
  { key: 'test', label: 'test', mark: '√' },
  { key: 'web', label: 'web', mark: '◍' },
  { key: 'team', label: 'agents', mark: '◊' },
]
export const PATH_STATIONS: ReadonlySet<string> = new Set(['read', 'search', 'edit', 'write'])
export const TEAM_TOOLS: ReadonlySet<string> = new Set(['Agent', 'Task', 'SendMessage', 'TaskCreate', 'TaskStop', 'ListAgents'])
export const TARGET_KEYS = ['file_path', 'notebook_path', 'path', 'to', 'url', 'query', 'description'] as const
export const TEST_RUNNERS: ReadonlySet<string> = new Set(['pytest', 'jest', 'vitest', 'mocha', 'bats', 'tox', 'molecule', 'rspec', 'phpunit', 'ctest', 'ansible-test', 'ansible-lint'])
export const TEST_VERBS: ReadonlySet<string> = new Set(['go', 'cargo', 'npm', 'pnpm', 'yarn', 'bun', 'make', 'deno', 'dotnet', 'mvn', 'gradle'])
export const WRAPPERS: ReadonlySet<string> = new Set(['sudo', 'env', 'time', 'timeout', 'nice', 'uv', 'npx', 'bunx', 'pipx', 'poetry', 'run', 'exec', 'python', 'python3', '-m'])

// A runner counts only in command position outside quotes, so `echo pytest` or `git commit -m "pytest"` stay runs.
export const isTestCommand = (command: string): boolean =>
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


export const PALETTE: readonly [number, ...number[]] = [0xd97757, 0x6a9bcc, 0x788c5d, 0xc46686, 0xbf9b30, 0x8f7fd6, 0x4fb3a9]
export const FLOOR = 0x1b1d22
export const FLOOR_SPECK = 0x262a31
export const WALL = 0x4a4a52
export const WOOD = 0x4a3826
export const WOOD_HOT = 0x8a6436
export const GLOW = 0xffe066
export const WAIT = 0xff9f43
export const MUSE = 0x9ab8ff
export const MUSINGS: readonly [string, ...string[]] = ['thinks', 'musing', 'mulling', 'ponders']
export const DARK = 0x3a3a3a
export const GHOST = 0x777777
export const TEXT = 0xc8c8c8
export const DIM = 0x6e6e6e
export const MAIL = 0xe58fb4

// Robot sprites are 5x6 pixels, three terminal rows of half blocks: five body rows and one row of legs.
export const SPRITE_W = 5
export const SPRITE_H = 3
export const STEP_POSE = 1
export const SITTING = 2

// b body, a accent, c second accent, e eye, k visor, d limb; legs are standing, mid-step and sitting.
export type Design = {
  rows: readonly string[]
  legs: readonly [string, string, string]
  body: number
  accent: number
  accent2: number
  eye: number
  visor: number
  limb: number
}

// Simplified from a sheet of nine pixel robots; a session draws all its robots in one of them.
export const DESIGNS: readonly [Design, ...Design[]] = [
  { rows: ['..a..', '.bbb.', 'bekeb', '.bbb.', 'dbbbd'], legs: ['.d.d.', '.dd..', '.ddd.'], body: 0xf0f0f0, accent: 0xe03040, accent2: 0xe03040, eye: 0x3aa0ff, visor: 0x202020, limb: 0x8a8a8a },
  { rows: ['..a..', '.bbb.', 'bekeb', 'bbbbb', '.bbb.'], legs: ['..c..', '.c.c.', '.....'], body: 0x22dd55, accent: 0x22dd55, accent2: 0x7dffa0, eye: 0x3aa0ff, visor: 0x101010, limb: 0x22dd55 },
  { rows: ['aaaaa', '..a..', 'bekeb', 'bbbbb', 'd...d'], legs: ['d.d.d', '.d.d.', 'ddddd'], body: 0xe03030, accent: 0x9a9a9a, accent2: 0x9a9a9a, eye: 0x3aa0ff, visor: 0x101010, limb: 0xe03030 },
  { rows: ['a...a', 'bbbbb', 'bekeb', 'bbbbb', '.b.b.'], legs: ['.c.c.', 'c...c', '.....'], body: 0xe03030, accent: 0xe03030, accent2: 0xff8030, eye: 0x5ac8ff, visor: 0x101010, limb: 0xe03030 },
  { rows: ['a...a', 'dbbbd', 'bekeb', 'dcccd', '.ccc.'], legs: ['d.c.d', '.dcd.', '..c..'], body: 0x3050e0, accent: 0x3070ff, accent2: 0xd030d0, eye: 0x5ac8ff, visor: 0x101010, limb: 0x8a8a8a },
  { rows: ['..d..', '.bbb.', 'bekeb', 'dbbbd', '.bbb.'], legs: ['.d.d.', 'd...d', '.ddd.'], body: 0xf0f0f0, accent: 0xff7020, accent2: 0xff7020, eye: 0x5ac8ff, visor: 0x202020, limb: 0x8a8a8a },
  { rows: ['b...b', 'bbbbb', 'bkekb', 'abbba', '.bbb.'], legs: ['.b.b.', 'b...b', '.bbb.'], body: 0xd030c0, accent: 0xa020a0, accent2: 0xa020a0, eye: 0x3a70ff, visor: 0x2020a0, limb: 0xd030c0 },
  { rows: ['d...d', '.aaa.', 'beeeb', '.aaa.', 'dbbbd'], legs: ['d...d', '.d.d.', '.....'], body: 0x4a4a5a, accent: 0xe03050, accent2: 0xe03050, eye: 0x40d0e0, visor: 0x202020, limb: 0x8a8a8a },
  { rows: ['..a..', '.bbb.', 'bekeb', 'bbabb', '.bbb.'], legs: ['.a.a.', 'a...a', '.aaa.'], body: 0x5ac8f0, accent: 0xe03050, accent2: 0xe03050, eye: 0xffffff, visor: 0x202020, limb: 0xe03050 },
]

// Wraps n into a list that is never empty, so the pick always exists.
export const cycle = <T,>(xs: readonly [T, ...T[]], n: number): T => xs[n % xs.length] ?? xs[0]

export const designOf = (session: string): Design => cycle(DESIGNS, hash(session))

// Each session takes its own design, or the next free one; ids go in sorted, so viewers of one session set agree.
export const designsFor = (sessions: readonly string[]): Map<string, Design> => {
  const taken = new Set<number>()
  const out = new Map<string, Design>()
  for (const id of [...new Set(sessions)].sort()) {
    const first = hash(id) % DESIGNS.length
    let pick = first
    for (let i = 0; i < DESIGNS.length && taken.has(pick); i++) pick = (first + i + 1) % DESIGNS.length
    if (taken.size >= DESIGNS.length) taken.clear()
    taken.add(pick)
    out.set(id, cycle(DESIGNS, pick))
  }
  return out
}

export const MAP_COLS = 84
export const MIN_ROWS = 20
export const MAX_ROWS = 120
export const MIN_COLS = 40
export const MAX_COLS = 200
export const QUIET_MS = 10000
export const HOT_MS = 2000
export const STATION_W = 10
export const DESK_W = 16
export const BLOCK_H = 8
export const SEATS = 2
export const SEAT_W = 8
// The desk top carries the session's name, so seats start on the row right below it.
export const DESK_TOP_H = 1
// A seat row holds a robot, its name and its tag.
export const SEAT_ROW_H = 5
// A name or tag no wider than a seat, so neighbours' labels never run together.
export const LABEL_W = 7
// Screen rows the pane does not get: the prompt, the status line and the pane's own frame.
export const SCREEN_CHROME = 6
export const LOG_ROWS = 5
// The compact map for OpenCode's sidebar: four stations a row, no spare row under them, three log lines.
export const COMPACT_STATION_W = 8
export const COMPACT_BLOCK_H = 7
export const COMPACT_LOG_ROWS = 3
export const LOG_KEEP = 30
export const LOG_SHARE = 6
export const LOG_SHARE_MS = 60000
export const STEP_MS = 100
export const STEPS_PER_TICK = 2
export const LINGER_MS = 4000
export const MAIL_MS = 4000
export const STALE_MS = 15000
export const BEACON_EVERY = 10
export const MAX_PEERS = 16
export const MAX_PEER_AGENTS = 32
export const MAX_LINKS = 8
// Peers see agent names no longer than a short label, never a whole task description.
export const LABEL_SHARE = 24
// The main robot carries the name of the harness it runs in, since the desk already names the repository.
export const AGENT = 'claude'
export const STALE_BUSY_MS = 30 * 60 * 1000
export const FORGET_MS = 60000
export const ROSTER_EVERY = 5
export const LEGEND_W = 18
export const LEGEND_ROWS = 6
export const FRAME_MS = 400
export const BLINK_MS = 1500
export const LIT_MS = 800
export const MUSING_MS = 2000
export const LOG_STAMP_X = 2
export const LOG_WHO_X = 11
export const LOG_WHO_W = 12
// Columns a log line's text never uses: the stamp, the gaps around the name and the wall.
export const LOG_TEXT_MARGIN = 15
export const CELL_BYTES = 12
export const WORD_BYTES = 4
export const HALF_BLOCK = 0x2580
export const CAP_STATUS = 32
export const CAP_SHORT = 64
export const CAP_LOG = 120
export const CAP_ID = 128
export const CAP_TEXT = 256
export const MAX_BEACON_BYTES = 64 * 1024
export const SESSION_ID = /^[A-Za-z0-9-]{1,64}$/
export const BEACON_NAME = /^([A-Za-z0-9-]{1,64})\.json$/
export const DENIED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export type Point = { x: number; y: number }
export type Glyph = { cp: number; fg: number; bg?: number }
export type Layout = {
  cols: number
  rows: number
  stations: Map<string, Point>
  stationW: number
  logRows: number
  deskTop: number
  divider: number
  logDivider: number
}

export const hash = (text: string) => [...text].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7)
export const short = (text: string, n: number) => (text.length > n ? '…' + text.slice(-(n - 1)) : text)
export const clip = (text: string, n: number) => (text.length > n ? text.slice(0, n - 1) + '…' : text)
// Width-1 ranges only: no combining marks, zero-width or bidi controls, which the engine refuses or misdraws.
export const DRAWABLE: readonly (readonly [number, number])[] = [
  [0x20, 0x7e],
  [0xa0, 0xac],
  [0xae, 0x2ff],
  [0x370, 0x482],
  [0x48a, 0x52f],
  [0x2010, 0x2027],
  [0x2030, 0x205e],
  [0x2070, 0x25ff],
]
export const printable = (ch: string): number => {
  const cp = ch.charCodeAt(0)
  return ch.length === 1 && DRAWABLE.some(([lo, hi]) => cp >= lo && cp <= hi) ? cp : 0x3f
}
export const crewInk = (crew: string, fallback: number): number => (crew ? cycle(PALETTE, hash(crew)) : fallback)
export const base = (path: string) => path.split('/').filter(Boolean).pop() ?? path

export const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const toBase64 = (bytes: Uint8Array) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    out += B64.charAt(a >> 2) + B64.charAt(((a & 3) << 4) | (b >> 4))
    out += i + 1 < bytes.length ? B64.charAt(((b & 15) << 2) | (c >> 6)) : '='
    out += i + 2 < bytes.length ? B64.charAt(c & 63) : '='
  }
  return out
}

// Stations along the front, one desk per session in rows below them, the log along the back wall.
const metricsOf = (compact: boolean) =>
  compact
    ? { stationW: COMPACT_STATION_W, blockH: COMPACT_BLOCK_H, logRows: COMPACT_LOG_ROWS }
    : { stationW: STATION_W, blockH: BLOCK_H, logRows: LOG_ROWS }

export const layoutFor = (cols: number, rows: number, compact = false): Layout => {
  const { stationW, blockH, logRows } = metricsOf(compact)
  const per = Math.max(1, Math.floor((cols - 3) / stationW))
  const stations = new Map(
    STATIONS.map((s, i) => [s.key, { x: 2 + (i % per) * stationW, y: 2 + Math.floor(i / per) * blockH }]),
  )
  const deskTop = 2 + Math.ceil(STATIONS.length / per) * blockH
  const logDivider = rows - logRows - 2
  return { cols, rows, stations, stationW, logRows, deskTop, divider: deskTop - 1, logDivider }
}

// The fewest rows that still hold the stations, one desk row and the log at this width.
export const minRowsFor = (cols: number, compact = false): number => {
  const { stationW, blockH, logRows } = metricsOf(compact)
  const per = Math.max(1, Math.floor((cols - 3) / stationW))
  return 2 + Math.ceil(STATIONS.length / per) * blockH + DESK_TOP_H + SEAT_ROW_H + logRows + 2
}

export const stationStand = (at: Point): Point => ({ x: at.x + 2, y: at.y + 2 })
export const deskSeat = (desk: Point, seat: number): Point => ({
  x: desk.x + 1 + (seat % SEATS) * SEAT_W,
  y: desk.y + DESK_TOP_H + Math.floor(seat / SEATS) * SEAT_ROW_H,
})

// Reads only a key the object holds itself, so a key such as "__proto__" never reaches Object.prototype.
export const own = <T,>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

// Control, format, private-use, unassigned and combining characters from a peer never reach the terminal.
export const clean = (text: string, n = CAP_TEXT): string =>
  text.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{M}]/gu, '').slice(0, n)

export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
export const str = (x: unknown, n = CAP_TEXT): string | undefined => (typeof x === 'string' ? clean(x, n) : undefined)
export const count = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)
export const flag = (x: unknown): boolean | undefined => (typeof x === 'boolean' ? x : undefined)
// Keys are cleaned before the prototype check, so a control character cannot smuggle "__proto__" past it.
export const safeEntries = (x: unknown, n: number): [string, unknown][] =>
  isRecord(x)
    ? Object.entries(x)
        .map(([key, value]): [string, unknown] => [clean(key), value])
        .filter(([key]) => !DENIED_KEYS.has(key))
        .slice(0, n)
    : []
export const list = (x: unknown, n: number): unknown[] => (Array.isArray(x) ? x.slice(0, n) : [])

export const toActivity = (x: unknown): Activity | undefined => {
  if (!isRecord(x)) return undefined
  const a = {
    tool: str(x.tool, CAP_SHORT),
    target: str(x.target),
    spot: str(x.spot, CAP_SHORT),
    spotAt: count(x.spotAt),
    onFile: flag(x.onFile),
    at: count(x.at),
    busy: flag(x.busy),
    waiting: flag(x.waiting),
    open: count(x.open),
    count: count(x.count),
  }
  const { tool, target, spot, spotAt, onFile, at, busy, waiting, open } = a
  if (
    tool === undefined || target === undefined || spot === undefined || spotAt === undefined || onFile === undefined ||
    at === undefined || busy === undefined || waiting === undefined || open === undefined || a.count === undefined
  ) {
    return undefined
  }
  const thinking = flag(x.thinking) ?? false
  const inTurn = flag(x.inTurn) ?? false
  return { tool, target, spot, spotAt, onFile, at, busy, waiting, open, count: a.count, thinking, inTurn }
}

export const toMember = (x: unknown): Member | undefined => {
  if (!isRecord(x)) return undefined
  const [id, name, type, status] = [str(x.id, CAP_ID), str(x.name, CAP_SHORT), str(x.type, CAP_SHORT), str(x.status, CAP_STATUS)]
  if (id === undefined || name === undefined || type === undefined || status === undefined) return undefined
  const parentId = str(x.parentId, CAP_ID)
  return parentId === undefined ? { id, name, type, status } : { id, name, type, status, parentId }
}

export const toLink = (x: unknown): Link | undefined => {
  if (!isRecord(x) || x.kind !== 'message') return undefined
  const [from, to, at] = [str(x.from, CAP_ID), str(x.to, CAP_ID), count(x.at)]
  return from === undefined || to === undefined || at === undefined ? undefined : { from, to, kind: 'message', at }
}

export const toLogLine = (x: unknown): LogLine | undefined => {
  if (!isRecord(x)) return undefined
  const [at, who, text] = [count(x.at), str(x.who, CAP_ID), str(x.text, CAP_LOG)]
  return at === undefined || who === undefined || text === undefined ? undefined : { at, who, text }
}

export const parsed = <T,>(pairs: [string, unknown][], parse: (x: unknown) => T | undefined): Record<string, T> =>
  Object.fromEntries(
    pairs.flatMap(([key, value]) => {
      const one = parse(value)
      return one === undefined ? [] : [[key, one]]
    }),
  )

// Another session's file is untrusted input: it is checked field by field, bounded, and never cast.
export const parseBeacon = (raw: string, id: string): Beacon | undefined => {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!isRecord(data) || data.v !== 1 || data.id !== id || data.ended === true || !isRecord(data.world)) return undefined
  const name = str(data.name, CAP_SHORT)
  const agent = str(data.agent, LABEL_SHARE)
  const at = count(data.at)
  if (name === undefined || at === undefined) return undefined
  const w = data.world
  return {
    v: 1,
    id,
    name,
    ...(agent ? { agent } : {}),
    at,
    world: {
      activity: parsed(safeEntries(w.activity, MAX_PEER_AGENTS), toActivity),
      links: list(w.links, MAX_LINKS).flatMap(one => toLink(one) ?? []),
      roster: list(w.roster, MAX_PEER_AGENTS).flatMap(one => toMember(one) ?? []),
      log: list(w.log, LOG_SHARE).flatMap(one => toLogLine(one) ?? []),
    },
  }
}

// Another session's ids carry its session id and a colon; ours carry none.
export const crewOf = (id: string): string => (id.includes(':') ? id.slice(0, id.indexOf(':')) : '')

// Ended and quiet agents stay out, and only file names travel: commands, queries and full paths can hold secrets.
export const beaconOf = (id: string, name: string, w: World, now: number, agent = AGENT): Beacon => {
  const roster = w.roster
    .filter(m => !isEnded(m.status))
    .slice(0, MAX_PEER_AGENTS)
    .map(m => ({ ...m, name: clip(clean(m.name), LABEL_SHARE) }))
  const listed = new Set(roster.map(m => m.id))
  const activity = Object.fromEntries(
    Object.entries(w.activity)
      .filter(([who, act]) => who === MAIN || listed.has(who) || act.busy || now - act.at <= QUIET_MS)
      .slice(0, MAX_PEER_AGENTS)
      .map(([who, act]) => [who, { ...act, target: act.onFile && PATH_STATIONS.has(act.spot) ? clip(base(act.target), CAP_SHORT) : '' }]),
  )
  const log = w.log.filter(l => now - l.at < LOG_SHARE_MS).slice(-LOG_SHARE)
  return { v: 1, id, name, agent, at: now, world: { activity, roster, log, links: w.links.filter(l => now - l.at < MAIL_MS) } }
}

// Turns a recipient as its sender named it into that recipient's actor id, or '' when unknown.
export const resolveLinks = (w: World, crew: string): Link[] => {
  const p = (id: string) => (crew ? `${crew}:${id}` : id)
  return w.links.map(l => {
    const hit = l.to === MAIN ? MAIN : w.roster.find(m => m.name === l.to || m.id === l.to)?.id
    return { ...l, from: p(l.from), to: hit ? p(hit) : '' }
  })
}

// Folds other sessions into one world with their ids prefixed by their session id.
export const mergeScene = (local: World, others: readonly Beacon[]): World => {
  const out: World = { activity: { ...local.activity }, links: resolveLinks(local, ''), roster: [...local.roster], log: [...local.log] }
  for (const b of others) {
    const p = (id: string) => `${b.id}:${id}`
    out.roster.push({ id: p(MAIN), name: b.agent || MAIN, type: 'main', status: 'running', desk: b.name })
    for (const m of b.world.roster) out.roster.push({ ...m, id: p(m.id), parentId: p(m.parentId ?? MAIN) })
    for (const [id, act] of Object.entries(b.world.activity)) {
      out.activity[p(id)] = { ...act, at: Math.min(act.at, b.at), spotAt: Math.min(act.spotAt, b.at) }
    }
    out.links.push(...resolveLinks(b.world, b.id))
    out.log.push(...b.world.log.filter(l => l.at <= b.at).map(l => ({ ...l, who: p(l.who) })))
  }
  out.log.sort((a, b) => a.at - b.at)
  return out
}

// local adds this session's own robot; a view that is no session of its own draws only what the beacons hold.
export const castOf = (w: World, now = Date.now(), local = true): Member[] => {
  const seen = new Set<string>(local ? [MAIN] : [])
  const cast: Member[] = local ? [{ id: MAIN, name: AGENT, type: 'main', status: 'running' }] : []
  for (const one of w.roster) {
    if (!seen.has(one.id) && !isEnded(one.status)) cast.push(one)
    seen.add(one.id)
  }
  for (const [id, act] of Object.entries(w.activity)) {
    const quiet = !act.busy && now - act.at > QUIET_MS
    const crew = crewOf(id)
    const name = (id.split(':').pop() ?? id).slice(0, 6)
    if (!seen.has(id) && !quiet) cast.push({ id, name, type: 'agent', status: 'running', parentId: crew ? `${crew}:${MAIN}` : undefined })
    seen.add(id)
  }
  return cast
}

// Desk order: this session first when it is drawn, then the others as the cast lists them.
export const crewsOf = (cast: readonly Member[]): string[] => {
  const crews = [...new Set(cast.map(a => crewOf(a.id)))]
  return crews.includes('') ? ['', ...crews.filter(Boolean)] : crews
}

export type DeskPlan = { crew: string; at: Point }

// Desks fill rows left to right; each row is as tall as its fullest desk, two seats to a seat row.
export const planDesks = (sizes: readonly (readonly [string, number])[], lay: Layout): DeskPlan[] => {
  const per = Math.max(1, Math.floor((lay.cols - 3) / DESK_W))
  const plans: DeskPlan[] = []
  let y = lay.deskTop
  for (let i = 0; i < sizes.length; i += per) {
    const row = sizes.slice(i, i + per)
    if (y + DESK_TOP_H + SEAT_ROW_H > lay.logDivider) break
    row.forEach(([crew], j) => plans.push({ crew, at: { x: 2 + j * DESK_W, y } }))
    y += DESK_TOP_H + Math.max(1, ...row.map(([, n]) => Math.ceil(n / SEATS))) * SEAT_ROW_H + 1
  }
  return plans
}

// Every robot owns a seat at its session's desk, in cast order; a seat that would cross into the log is left out.
export const seatsOf = (cast: readonly Member[], lay: Layout): { seats: Map<string, Point>; desks: DeskPlan[] } => {
  const crews = crewsOf(cast)
  const sizes = crews.map(crew => [crew, cast.filter(a => crewOf(a.id) === crew).length] as const)
  const desks = planDesks(sizes, lay)
  const byCrew = new Map(desks.map(d => [d.crew, d.at]))
  const taken = new Map<string, number>()
  const seats = new Map<string, Point>()
  for (const a of cast) {
    const crew = crewOf(a.id)
    const desk = byCrew.get(crew)
    const n = taken.get(crew) ?? 0
    taken.set(crew, n + 1)
    const seat = desk && deskSeat(desk, n)
    if (seat && seat.y + SEAT_ROW_H <= lay.logDivider) seats.set(a.id, seat)
  }
  return { seats, desks }
}

// Where an actor's last action puts it: its station, or its own seat while it thinks; undefined when nowhere.
export const placesOf = (w: World, cast: readonly Member[], lay: Layout, seats: Map<string, Point>): Map<string, Point> => {
  const places = new Map<string, Point>()
  for (const a of cast) {
    const spot = own(w.activity, a.id)?.spot ?? ''
    const place = spot === THINK ? seats.get(a.id) : lay.stations.get(spot)
    if (place) places.set(a.id, spot === THINK ? place : stationStand(place))
  }
  return places
}

export type Pos = Point & { steps: number; arrived?: number; served?: number }

// A robot stays at its last place while it thinks, its turn runs or it is a running subagent; then it lingers.
export const goalFor = (w: World, a: Member, home: Point, place: Point | undefined, now: number, pos: Pos | undefined): Point => {
  const act = own(w.activity, a.id)
  if (!act || isEnded(a.status) || !place) return home
  const stays = act.thinking || act.inTurn || (act.busy && act.onFile) || (a.type !== 'main' && a.status === 'running')
  if (stays) return place
  if (pos?.served === act.spotAt) return home
  const lingered = pos?.arrived !== undefined && now - Math.max(act.spotAt, pos.arrived) > LINGER_MS
  return lingered ? home : place
}

export const idleActivity = (now: number): Activity => ({
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

// A model request seats the agent to think; the engine's own forks, which no roster lists, are ignored.
export const startThinking = (w: World, who: string, now: number): World => {
  const prior = own(w.activity, who)
  if (!prior && who !== MAIN && !w.roster.some(m => m.id === who)) return w
  const act: Activity = { ...(prior ?? idleActivity(now)), thinking: true, inTurn: true, spot: THINK, spotAt: now, at: now }
  return { ...w, activity: { ...w.activity, [who]: act } }
}

export const setTurn = (w: World, who: string, patch: Partial<Pick<Activity, 'thinking' | 'inTurn'>>, now: number): World => {
  const prior = own(w.activity, who)
  if (!prior && who !== MAIN) return w
  return { ...w, activity: { ...w.activity, [who]: { ...(prior ?? idleActivity(now)), ...patch } } }
}

// Departed agents are forgotten, and a call busy for half an hour is taken as one whose end was never recorded.
export const pruned = (w: World, now: number): World => {
  const listed = new Set(w.roster.filter(m => !isEnded(m.status)).map(m => m.id))
  const activity = Object.fromEntries(
    Object.entries(w.activity)
      .filter(([who, act]) => who === MAIN || listed.has(who) || act.busy || now - act.at <= FORGET_MS)
      .map(([who, act]) => [who, act.busy && now - act.at > STALE_BUSY_MS ? { ...act, busy: false, open: 0, waiting: false } : act]),
  )
  return { ...w, activity }
}

export const markWaiting = (w: World, who: string, waiting: boolean): World => {
  const act = own(w.activity, who)
  return act ? { ...w, activity: { ...w.activity, [who]: { ...act, waiting } } } : w
}

// Which station a tool call belongs at; '' leaves the robot where it was.
export const spotOf = (tool: string, command = ''): StationKey | '' => {
  if (tool === 'Read' || tool === 'NotebookRead') return 'read'
  if (tool === 'Grep' || tool === 'Glob' || tool === 'LS') return 'search'
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') return 'edit'
  if (tool === 'Write') return 'write'
  if (tool === 'Bash' || tool === 'PowerShell') return isTestCommand(command) ? 'test' : 'run'
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'web'
  if (TEAM_TOOLS.has(tool)) return 'team'
  return ''
}

// One plain sentence per action; commands, queries and message bodies never appear, since logs travel in beacons.
export const describe = (tool: string, spot: string, target: string): string => {
  const what = clip(base(clean(target, 200)), 40)
  if (spot === 'read') return what ? `reads ${what}` : 'reads a file'
  if (spot === 'search') return what ? `searches ${what}` : 'searches the code'
  if (spot === 'edit') return what ? `edits ${what}` : 'edits a file'
  if (spot === 'write') return what ? `writes ${what}` : 'writes a file'
  if (spot === 'run') return 'runs a command'
  if (spot === 'test') return 'runs the tests'
  if (spot === 'web') return tool === 'WebSearch' ? 'searches the web' : 'fetches a web page'
  if (tool === 'SendMessage') return what ? `messages ${what}` : 'sends a message'
  if (spot === 'team') return tool === 'Agent' || tool === 'Task' ? 'starts a subagent' : 'checks on its team'
  return `uses ${clip(clean(tool.replace(/^mcp__/, '').replace(/__/g, ' '), 64), 40)}`
}

// State saved before logs existed has no log field, so every stored world passes through here before use.
export const normalise = (w: World): World => (Array.isArray(w.log) ? w : { ...w, log: [] })

export const logged = (w: World, who: string, text: string, now: number): World => ({
  ...w,
  log: [...normalise(w).log, { at: now, who, text }].slice(-LOG_KEEP),
})

export const targetOf = (e: Record<string, unknown>): string => {
  for (const key of TARGET_KEYS) {
    const value = e[key]
    if (typeof value === 'string') return value.slice(0, CAP_TEXT)
  }
  if (typeof e.command === 'string') return (e.command.split('\n')[0] ?? '').slice(0, 40)
  return ''
}

export class Canvas {
  px: number[]
  glyphs: (Glyph | undefined)[]

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.px = Array.from({ length: cols * rows * 2 }, (_, i) =>
      ((i % cols) * 7 + Math.floor(i / cols) * 13) % 23 === 0 ? FLOOR_SPECK : FLOOR,
    )
    this.glyphs = new Array(cols * rows)
  }

  dot(x: number, y: number, color: number) {
    if (x >= 0 && x < this.cols && y >= 0 && y < this.rows * 2) this.px[y * this.cols + x] = color
  }

  put(x: number, y: number, ch: string, fg: number, bg?: number) {
    if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) this.glyphs[y * this.cols + x] = { cp: printable(ch), fg, bg }
  }

  write(x: number, y: number, text: string, fg: number, bg?: number) {
    ;[...text].forEach((ch, i) => this.put(x + i, y, ch, fg, bg))
  }

  clear(x: number, y: number) {
    if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) this.glyphs[y * this.cols + x] = undefined
  }

  // One terminal cell as code point, foreground and background: a glyph, or two pixels as a half block.
  cell(x: number, y: number): readonly [number, number, number] {
    const top = this.px[2 * y * this.cols + x] ?? FLOOR
    const bottom = this.px[(2 * y + 1) * this.cols + x] ?? FLOOR
    const g = this.glyphs[y * this.cols + x]
    return g ? [g.cp, g.fg, g.bg ?? top] : top === bottom ? [0x20, top, top] : [HALF_BLOCK, top, bottom]
  }

  encode(): string {
    const view = new DataView(new ArrayBuffer(this.cols * this.rows * CELL_BYTES))
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x
        this.cell(x, y).forEach((word, k) => view.setUint32(i * CELL_BYTES + k * WORD_BYTES, word, true))
      }
    }
    return toBase64(new Uint8Array(view.buffer))
  }
}

export type Look = { eye: number; lit: boolean; pose: number; ghost: boolean }

export const drawRobot = (c: Canvas, at: Point, d: Design, look: Look) => {
  const ink: Record<string, number> = look.ghost
    ? { b: GHOST, a: GHOST, c: GHOST, e: DARK, k: DARK, d: GHOST }
    : { b: d.body, a: look.lit ? GLOW : d.accent, c: d.accent2, e: look.eye, k: d.visor, d: d.limb }
  ;[...d.rows, d.legs[look.pose] ?? ''].forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      const color = own(ink, ch)
      if (color !== undefined) c.dot(at.x + dx, at.y * 2 + dy, color)
    }),
  )
  for (let dy = 0; dy < SPRITE_H; dy++) for (let dx = 0; dx < SPRITE_W; dx++) c.clear(at.x + dx, at.y + dy)
}

// Walks one cell per step, favouring the longer axis so paths look diagonal-ish rather than L-shaped.
export const stepToward = (from: Point, to: Point): Point => {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  if (dx && (!dy || Math.abs(to.x - from.x) >= 2 * Math.abs(to.y - from.y))) return { x: from.x + dx, y: from.y }
  return { x: from.x, y: from.y + dy }
}

// Draws one frame and walks the robots; one instance per view, since it remembers where each robot stands.
export class Scene {
  private positions = new Map<string, Pos>()
  private drawnSize = ''

  // here names the local desk and self keys its design; local is false where no session of its own is drawn.
  paint(w: World, lay: Layout, now: number, advance: boolean, here: string, self: string, local = true): Canvas {
    const c = new Canvas(lay.cols, lay.rows)
    const everyone = castOf(w, now, local)
    const { seats, desks } = seatsOf(everyone, lay)
    const places = placesOf(w, everyone, lay, seats)
    const cast = everyone.filter(a => seats.has(a.id) || places.has(a.id))
    const crews = crewsOf(everyone)
    const size = `${lay.cols}x${lay.rows}`
    if (advance && size !== this.drawnSize) {
      this.positions.clear()
      this.drawnSize = size
    }
    const looks = designsFor(crews.map(crew => crew || self))
    const frame = Math.floor(now / FRAME_MS) % 2

    for (let x = 0; x < lay.cols; x++) {
      c.put(x, 0, '▓', WALL, FLOOR)
      c.put(x, lay.rows - 1, '▓', WALL, FLOOR)
    }
    for (let y = 0; y < lay.rows; y++) {
      c.put(0, y, '▓', WALL, FLOOR)
      c.put(lay.cols - 1, y, '▓', WALL, FLOOR)
    }
    c.write(3, 0, ' STATIONS ', TEXT, WALL)
    for (let x = 1; x < lay.cols - 1; x++) c.put(x, lay.divider, '┈', DIM)
    c.write(3, lay.divider, ' DESKS ', DIM)
    for (let x = 1; x < lay.cols - 1; x++) c.put(x, lay.logDivider, '▓', WALL, FLOOR)
    c.write(3, lay.logDivider, ' LOGS ', TEXT, WALL)

    const where = new Map<string, Pos>()
    const crowd = new Map<string, number>()
    if (advance) for (const id of [...this.positions.keys()]) if (!cast.some(a => a.id === id)) this.positions.delete(id)
    for (const a of cast) {
      const home = seats.get(a.id) ?? places.get(a.id)
      if (!home) continue
      let pos = this.positions.get(a.id)
      const goal = goalFor(w, a, home, places.get(a.id), now, pos)
      if (!pos) {
        const parent = this.positions.get(a.parentId ?? MAIN)
        pos = { ...(a.id === MAIN || !parent ? goal : parent), steps: 0 }
      }
      for (let i = 0; advance && i < STEPS_PER_TICK && (pos.x !== goal.x || pos.y !== goal.y); i++) {
        pos = { ...pos, ...stepToward(pos, goal), steps: pos.steps + 1 }
      }
      const atPlace = pos.x === goal.x && pos.y === goal.y && goal !== home
      const leaving = goal === home && pos.arrived !== undefined
      pos = { ...pos, arrived: atPlace ? (pos.arrived ?? now) : undefined, served: leaving ? own(w.activity, a.id)?.spotAt : pos.served }
      if (advance) this.positions.set(a.id, pos)
      where.set(a.id, pos)
      const spot = own(w.activity, a.id)?.spot
      if (atPlace && spot && spot !== THINK) crowd.set(spot, (crowd.get(spot) ?? 0) + 1)
    }

    for (const s of STATIONS) {
      const at = lay.stations.get(s.key)
      if (!at) continue
      const hot = cast.some(a => {
        const act = own(w.activity, a.id)
        return act?.spot === s.key && (act.busy || now - act.at < HOT_MS)
      })
      const n = crowd.get(s.key) ?? 0
      c.write(at.x + 3, at.y, ` ${s.mark}${s.mark} `, cycle(PALETTE, hash(s.key)), hot ? WOOD_HOT : WOOD)
      c.write(at.x + 1, at.y + 1, clip(n > 1 ? `${s.label}×${n}` : s.label, lay.stationW - 2), hot ? TEXT : DIM)
    }

    desks.forEach(({ crew, at: desk }) => {
      const name = crew ? (w.roster.find(m => m.id === `${crew}:${MAIN}`)?.desk ?? crew.slice(0, 6)) : here
      const busy = cast.some(a => crewOf(a.id) === crew && own(w.activity, a.id)?.thinking)
      const ink = crewInk(crew, MUSE)
      const label = clip(name, DESK_W - 5)
      c.write(desk.x + 1, desk.y, ` ${label} ${'∴'.repeat(DESK_W - 5 - label.length)}`, ink, busy ? WOOD_HOT : WOOD)
      c.write(desk.x + 2, desk.y, label, TEXT, busy ? WOOD_HOT : WOOD)
    })

    for (const link of w.links.filter(l => now - l.at < MAIL_MS)) {
      const from = where.get(link.from)
      const to = where.get(link.to)
      if (!from || !to || from === to) continue
      const n = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))
      for (let k = 1; k < n; k += 2) {
        const x = Math.round(from.x + 3 + ((to.x - from.x) * k) / n)
        const y = Math.round(from.y + 1 + ((to.y - from.y) * k) / n)
        c.put(x, y, '·', MAIL)
      }
    }

    for (const a of cast) {
      const pos = where.get(a.id)
      if (!pos) continue
      const act = own(w.activity, a.id)
      const ended = isEnded(a.status)
      const home = seats.get(a.id) ?? places.get(a.id)
      if (!home) continue
      const goal = goalFor(w, a, home, places.get(a.id), now, pos)
      const walking = pos.x !== goal.x || pos.y !== goal.y
      const seated = !walking && goal.x === home.x && goal.y === home.y
      const busy = !!act?.busy && !act.waiting && !walking
      const musing = !!act?.thinking && !act.busy && !walking
      const blink = !busy && Math.floor(now / BLINK_MS) % 4 === 0
      const design = looks.get(crewOf(a.id) || self) ?? designOf(crewOf(a.id) || self)
      drawRobot(c, pos, design, {
        eye: busy ? GLOW : blink || musing ? design.visor : design.eye,
        lit: (busy && frame === 0) || (musing && Math.floor(now / LIT_MS) % 2 === 0),
        pose: walking ? (pos.steps % 2) * STEP_POSE : seated ? SITTING : 0,
        ghost: ended,
      })
    }

    for (const a of cast) {
      const pos = where.get(a.id)
      if (!pos) continue
      const act = own(w.activity, a.id)
      const crew = crewOf(a.id)
      const ink = isEnded(a.status) ? DIM : crewInk(crew, TEXT)
      c.write(pos.x, pos.y + SPRITE_H, clip(a.name, LABEL_W), ink)
      if (act?.busy) c.write(pos.x, pos.y + SPRITE_H + 1, clip((act.waiting ? '? ' : '') + act.tool, LABEL_W), act.waiting ? WAIT : GLOW)
      else if (act?.thinking) c.write(pos.x, pos.y + SPRITE_H + 1, cycle(MUSINGS, Math.floor(now / MUSING_MS)), MUSE)
    }

    const names = new Map<string, string>(everyone.map(a => [a.id, a.name]))
    const lines = w.log.slice(-lay.logRows)
    lines.forEach((line, i) => {
      const y = lay.logDivider + 1 + i
      const crew = crewOf(line.who)
      const who = clip(names.get(line.who) ?? w.roster.find(m => m.id === line.who)?.name ?? line.who.slice(-6), LOG_WHO_W)
      const stamp = new Date(line.at).toTimeString().slice(0, 8)
      c.write(LOG_STAMP_X, y, stamp, DIM)
      c.write(LOG_WHO_X, y, who, crewInk(crew, MUSE))
      c.write(LOG_WHO_X + 1 + who.length, y, clip(line.text, lay.cols - LOG_TEXT_MARGIN - who.length), TEXT)
    })

    return c
  }
}
