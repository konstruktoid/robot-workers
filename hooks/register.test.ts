import { expect, test } from 'claude-code/testing'

import {
  DESIGNS,
  STATIONS,
  beaconOf,
  castOf,
  clean,
  crewOf,
  crewsOf,
  deskSeat,
  designOf,
  designsFor,
  goalFor,
  layoutFor,
  markWaiting,
  mergeScene,
  own,
  parseBeacon,
  placesOf,
  planDesks,
  pruned,
  minRowsFor,
  isTestCommand,
  seatsOf,
  describe as describeAction,
  logged,
  printable,
  setTurn,
  spotOf,
  startThinking,
  stationStand,
  stepToward,
} from './scene'
import type { Activity } from '../types'

const empty = { activity: {}, links: [], roster: [], log: [] }

const act = (over: Partial<Activity> = {}): Activity => ({
  tool: 'Read',
  target: '/a.ts',
  spot: 'read',
  spotAt: 1000,
  onFile: true,
  at: 1000,
  busy: false,
  waiting: false,
  open: 0,
  count: 1,
  thinking: false,
  inTurn: false,
  ...over,
})

const lay = layoutFor(84, 40)
const main = { id: 'main', name: 'session', type: 'main', status: 'running' }
const desk0 = { x: 2, y: lay.deskTop }
const desk1 = { x: 18, y: lay.deskTop }
const seat0 = deskSeat(desk0, 0)
const readAt = stationStand(lay.stations.get('read')!)

test('the pane draws only the map on terminal and the text legend elsewhere', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'robot-workers', surface, component: 'Pane', props: {}, requestId: 'workers' })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn.includes('session')).toBe(surface === 'desktop')
    expect(drawn.includes('"Raster"')).toBe(surface === 'terminal')
    await ui.unmount()
  }
})

test('stations sit in one row at the front, desks below them, the log at the back', () => {
  expect(lay.stations.size).toBe(STATIONS.length)
  const ys = new Set([...lay.stations.values()].map(p => p.y))
  expect([...ys]).toEqual([2])
  expect(lay.deskTop).toBeGreaterThan(lay.divider)
  expect(lay.deskTop + 7).toBeLessThan(lay.logDivider)
  expect(lay.logDivider).toBe(40 - 5 - 2)
})

test('a narrow map wraps the stations onto more rows', () => {
  const narrow = layoutFor(44, 40)
  expect(new Set([...narrow.stations.values()].map(p => p.y)).size).toBe(2)
  expect(narrow.deskTop).toBeGreaterThan(narrow.divider)
})

test('tool calls map to actions, and test runners count as tests', () => {
  expect(['Read', 'Grep', 'Glob', 'Edit', 'Write', 'WebFetch', 'Agent', 'SendMessage', 'TodoWrite'].map(t => spotOf(t))).toEqual([
    'read',
    'search',
    'search',
    'edit',
    'write',
    'web',
    'team',
    'team',
    '',
  ])
  expect(spotOf('Bash', 'ls -la')).toBe('run')
  expect(spotOf('Bash', 'uv run pytest -q')).toBe('test')
  expect(spotOf('Bash', 'npm run test')).toBe('test')
  expect(spotOf('Bash', 'claude plugin test .')).toBe('test')
  expect(spotOf('Bash', 'molecule converge')).toBe('test')
  expect(spotOf('Bash', 'cat latest.txt')).toBe('run')
  for (const cmd of ['echo pytest', 'grep -r vitest src', 'git commit -m "fix tox"', 'cat jest.config.js', 'rm -rf mocha']) {
    expect(spotOf('Bash', cmd)).toBe('run')
  }
  for (const cmd of ['cd role && molecule test', 'CI=1 npx jest', 'uv run python -m pytest', 'make lint; make test', 'go test ./...']) {
    expect(spotOf('Bash', cmd)).toBe('test')
  }
})

test('a robot keeps walking to its station after the call ended, then lingers and goes home', () => {
  const w = { ...empty, activity: { main: act() } }
  expect(goalFor(w, main, seat0, readAt, 61000, { x: 40, y: 30, steps: 3 })).toEqual(readAt)
  const there = { ...readAt, steps: 9, arrived: 61000 }
  expect(goalFor(w, main, seat0, readAt, 62000, there)).toEqual(readAt)
  expect(goalFor(w, main, seat0, readAt, 66000, there)).toBe(seat0)
  expect(goalFor(w, main, seat0, readAt, 66000, { ...there, served: 1000 })).toBe(seat0)
})

test('a robot with nowhere to be stays home', () => {
  const w = { ...empty, activity: { main: act() } }
  expect(goalFor(w, main, seat0, undefined, 1000, undefined)).toBe(seat0)
})

test('thinking seats the robot at its session desk, an open turn keeps it there, and idle sends it home', () => {
  let w = startThinking(empty, 'main', 1000)
  const cast = castOf(w, 1000)
  const seat = placesOf(w, cast, lay, seatsOf(cast, lay).seats).get('main')
  expect(seat).toEqual(seat0)
  expect(goalFor(w, main, seat0, seat, 1100, undefined)).toEqual(seat)
  const sitting = { ...seat!, steps: 3, arrived: 1200 }
  w = setTurn(w, 'main', { thinking: false }, 2000)
  expect(goalFor(w, main, seat0, seat, 60000, sitting)).toEqual(seat)
  w = setTurn(w, 'main', { inTurn: false }, 60000)
  expect(goalFor(w, main, seat0, seat, 70000, sitting)).toBe(seat0)
})

test('each session thinks at its own desk, and two thinkers of one session take both seats', () => {
  const remote = {
    ...empty,
    roster: [{ id: 'a1', name: 'rev', type: 'Explore', status: 'running' }],
  }
  const theirs = startThinking(startThinking(remote, 'main', 1000), 'a1', 1000)
  const w = mergeScene(startThinking(empty, 'main', 1000), [{ v: 1, id: 'S', name: 'ansible', at: 0, world: theirs }])
  const cast = castOf(w, 1000)
  expect(crewsOf(cast)).toEqual(['', 'S'])
  const places = placesOf(w, cast, lay, seatsOf(cast, lay).seats)
  expect(places.get('main')).toEqual(deskSeat(desk0, 0))
  expect(places.get('S:main')).toEqual(deskSeat(desk1, 0))
  expect(places.get('S:a1')).toEqual(deskSeat(desk1, 1))
})

test('a call on no station keeps the robot where it was', () => {
  const later = act({ tool: 'TodoWrite', target: '', onFile: false, at: 9000, busy: true, open: 1 })
  const w = { ...empty, activity: { main: later } }
  const there = { ...readAt, steps: 1, arrived: 1000 }
  expect(goalFor(w, main, seat0, readAt, 9100, there)).toBe(seat0)
  expect(goalFor(w, main, seat0, readAt, 1500, there)).toEqual(readAt)
})

test('the cast puts the session first and adds unlisted agents', () => {
  const cast = castOf({ ...empty, activity: { x1: act({ at: 0, busy: true, open: 1 }) } })
  expect(cast.map(a => a.id)).toEqual(['main', 'x1'])
})

test('ended agents leave the cast and their seat is reused', () => {
  const roster = [
    { id: 'a', name: 'a', type: 'Explore', status: 'completed' },
    { id: 'b', name: 'b', type: 'Explore', status: 'running' },
  ]
  const cast = castOf({ ...empty, roster, activity: { a: act() } })
  expect([...seatsOf(cast, lay).seats.entries()]).toEqual([
    ['main', deskSeat(desk0, 0)],
    ['b', deskSeat(desk0, 1)],
  ])
})

test('an agent only known from its tool calls leaves the map once it is idle and quiet', () => {
  const w = { ...empty, activity: { x1: act({ at: 1000 }), x2: act({ at: 95000 }) } }
  expect(castOf(w, 100000).map(a => a.id)).toEqual(['main', 'x2'])
})

test('robots walk one cell at a time toward the goal', () => {
  let at = { x: 0, y: 10 }
  const goal = { x: 6, y: 2 }
  for (let i = 0; i < 14; i++) at = stepToward(at, goal)
  expect(at).toEqual(goal)
})

test('the canvas only takes printable width-1 characters', () => {
  expect([printable('a'), printable('▀'), printable('\n'), printable('😀'), printable('漢')]).toEqual([0x61, 0x2580, 0x3f, 0x3f, 0x3f])
  expect(STATIONS.every(s => printable(s.mark) !== 0x3f)).toBe(true)
})

test('a waiting robot is marked on its own agent only', () => {
  const w = { ...empty, activity: { main: act({ busy: true, open: 1 }), x1: act({ busy: true, open: 1 }) } }
  const marked = markWaiting(w, 'x1', true)
  expect([marked.activity.main.waiting, marked.activity.x1.waiting]).toEqual([false, true])
  expect(markWaiting(w, 'nobody', true)).toBe(w)
})

test('another session joins with prefixed ids and its own robot first', () => {
  const remote = {
    ...empty,
    roster: [{ id: 'a1', name: 'rev', type: 'Explore', status: 'running' }],
    activity: { a1: act({ spot: 'edit' }) },
  }
  const w = mergeScene(empty, [{ v: 1, id: 'S', name: 'prescryb', at: 0, world: remote }])
  expect(castOf(w).map(a => [a.id, a.name, a.parentId])).toEqual([
    ['main', 'session', undefined],
    ['S:main', 'prescryb', undefined],
    ['S:a1', 'rev', 'S:main'],
  ])
  expect(w.activity['S:a1'].spot).toBe('edit')
  expect([crewOf('S:a1'), crewOf('a1')]).toEqual(['S', ''])
})

test('messages resolve to actor ids within their own session', () => {
  const remote = {
    ...empty,
    roster: [{ id: 'a1', name: 'rev', type: 'Explore', status: 'running' }],
    links: [
      { from: 'main', to: 'rev', kind: 'message' as const, at: 1 },
      { from: 'a1', to: 'main', kind: 'message' as const, at: 1 },
      { from: 'a1', to: 'nobody', kind: 'message' as const, at: 1 },
    ],
  }
  const local = { ...empty, links: [{ from: 'main', to: 'rev', kind: 'message' as const, at: 1 }] }
  const w = mergeScene(local, [{ v: 1, id: 'S', name: 'p', at: 0, world: remote }])
  expect(w.links.map(l => [l.from, l.to])).toEqual([
    ['main', ''],
    ['S:main', 'S:a1'],
    ['S:a1', 'S:main'],
    ['S:a1', ''],
  ])
})

test('a beacon leaves out ended agents and quiet ones the roster no longer lists', () => {
  const roster = [
    { id: 'run', name: 'run', type: 'Explore', status: 'running' },
    { id: 'done', name: 'done', type: 'Explore', status: 'completed' },
  ]
  const activity = {
    main: act({ at: 0 }),
    run: act({ at: 0 }),
    done: act({ at: 0 }),
    gone: act({ at: 0 }),
    busy: act({ at: 0, busy: true, open: 1 }),
    recent: act({ at: 95000 }),
  }
  const b = beaconOf('S', 'p', { ...empty, roster, activity }, 100000)
  expect(b.world.roster.map(m => m.id)).toEqual(['run'])
  expect(Object.keys(b.world.activity).sort()).toEqual(['busy', 'main', 'recent', 'run'])
})

test('a beacon carries file names but never shell commands, queries or messages', () => {
  const w = {
    ...empty,
    activity: {
      main: act({ tool: 'Bash', target: 'curl -H "token: s3cret"', spot: 'run' }),
      a: act({ tool: 'Read', target: '/x.ts', spot: 'read', at: 9999 }),
      b: act({ tool: 'WebSearch', target: 'internal codename', spot: 'web', at: 9999 }),
      c: act({ tool: 'TodoWrite', target: 'plan', spot: 'think', at: 9999 }),
    },
  }
  const b = beaconOf('S', 'p', w, 10000)
  expect(['main', 'a', 'b', 'c'].map(k => b.world.activity[k].target)).toEqual(['', 'x.ts', '', ''])
})

test('a beacon round-trips through the parser', () => {
  const w = { ...empty, activity: { main: act({ busy: true, open: 1 }) } }
  const b = beaconOf('S-1', 'proj', w, 5000)
  expect(parseBeacon(JSON.stringify(b), 'S-1')).toEqual(b)
})

test('the parser refuses a beacon that is not what its file name says, ended, or not JSON', () => {
  const b = beaconOf('S', 'proj', empty, 5000)
  expect(parseBeacon(JSON.stringify(b), 'T')).toBeUndefined()
  expect(parseBeacon(JSON.stringify({ ...b, ended: true }), 'S')).toBeUndefined()
  expect(parseBeacon('{not json', 'S')).toBeUndefined()
  expect(parseBeacon('[]', 'S')).toBeUndefined()
})

test('the parser drops prototype keys, malformed entries and control characters, and ignores old file lists', () => {
  const raw = `{"v":1,"id":"S","name":"pro\\u001b[31mj","at":1,"world":{
    "activity":{"__proto__":{"tool":"Read"},"ok":${JSON.stringify(act())},"bad":{"tool":7}},
    "files":{"/x.ts":{"touches":1,"first":1,"last":1,"by":[]}},
    "links":[{"from":"a","to":"b","kind":"message","at":1},{"from":"a","kind":"message"}],
    "roster":[{"id":"r","name":"n","type":"t","status":"running"},{"id":5}]}}`
  const b = parseBeacon(raw, 'S')
  expect(b?.name).toBe('pro[31mj')
  expect(Object.keys(b?.world.activity ?? {})).toEqual(['ok'])
  expect(Object.keys(b?.world ?? {}).sort()).toEqual(['activity', 'links', 'log', 'roster'])
  expect(b?.world.links.length).toBe(1)
  expect(b?.world.roster.map(m => m.id)).toEqual(['r'])
  expect(Object.getPrototypeOf(b?.world.activity)).toBe(Object.prototype)
})

test('a beacon from an older version without thinking fields still parses', () => {
  const { thinking: _t, inTurn: _i, ...older } = act()
  const raw = JSON.stringify({ v: 1, id: 'S', name: 'p', at: 1, world: { activity: { main: older }, links: [], roster: [], log: [] } })
  expect(parseBeacon(raw, 'S')?.world.activity.main).toEqual({ ...older, thinking: false, inTurn: false })
})

test('own lookups and clean text resist odd keys and escapes', () => {
  expect(own({}, '__proto__')).toBeUndefined()
  expect(own({ a: 1 }, 'a')).toBe(1)
  expect(clean('a\u0007b\u009bc\nd')).toBe('abcd')
})

test('a model step of an agent nobody listed changes nothing', () => {
  expect(startThinking(empty, 'fork-1', 1)).toBe(empty)
  expect(setTurn(empty, 'fork-1', { inTurn: false }, 1)).toBe(empty)
})

test('every robot design is five pixels wide and six tall, with standing, stepping and sitting legs', () => {
  expect(DESIGNS.length).toBe(9)
  for (const d of DESIGNS) {
    expect(d.rows.length).toBe(5)
    expect([...d.rows, ...d.legs].every(row => row.length === 5 && /^[.abcdek]+$/.test(row))).toBe(true)
  }
})

test('a session keeps one design, and different sessions spread over the designs', () => {
  expect(designOf('S-1')).toBe(designOf('S-1'))
  const seen = new Set(Array.from({ length: 40 }, (_, i) => designOf(`session-${i}`)))
  expect(seen.size).toBeGreaterThan(4)
})

test('log lines describe actions without commands, queries or message bodies', () => {
  expect(describeAction('Read', 'read', '/repo/src/a.ts')).toBe('reads a.ts')
  expect(describeAction('Bash', 'run', 'curl -H "token: s3cret"')).toBe('runs a command')
  expect(describeAction('Bash', 'test', 'pytest -k secret')).toBe('runs the tests')
  expect(describeAction('WebSearch', 'web', 'internal codename')).toBe('searches the web')
  expect(describeAction('SendMessage', 'team', 'rev')).toBe('messages rev')
  expect(describeAction('Agent', 'team', 'audit the vault')).toBe('starts a subagent')
  expect(describeAction('mcp__prescryb__check_cves', '', '')).toBe('uses prescryb check_cves')
})

test('the log keeps the latest lines, and a beacon shares only recent ones with ids prefixed on merge', () => {
  let w = empty
  for (let i = 0; i < 40; i++) w = logged(w, 'main', `step ${i}`, i * 1000)
  expect(w.log.length).toBe(30)
  expect(w.log[29].text).toBe('step 39')
  const b = beaconOf('S', 'p', w, 40000)
  expect(b.world.log.map(l => l.text)).toEqual(['step 34', 'step 35', 'step 36', 'step 37', 'step 38', 'step 39'])
  const merged = mergeScene(logged(empty, 'main', 'here', 36500), [b])
  expect(merged.log.map(l => [l.who, l.text]).slice(0, 4)).toEqual([
    ['S:main', 'step 34'],
    ['S:main', 'step 35'],
    ['S:main', 'step 36'],
    ['main', 'here'],
  ])
})

test('state saved before logs existed still takes a log line', () => {
  const old = { activity: {}, links: [], roster: [] } as unknown as typeof empty
  expect(logged(old, 'main', 'hello', 1).log).toEqual([{ at: 1, who: 'main', text: 'hello' }])
})

test('visible sessions never share a design, and every session computes the same assignment', () => {
  const ids = Array.from({ length: 9 }, (_, i) => `session-${i}`)
  const looks = designsFor(ids)
  expect(new Set(looks.values()).size).toBe(9)
  const reversed = designsFor([...ids].reverse())
  expect(ids.every(id => looks.get(id) === reversed.get(id))).toBe(true)
  const alone = designsFor(['S-1'])
  expect(alone.get('S-1')).toBe(designOf('S-1'))
  expect(designsFor(Array.from({ length: 12 }, (_, i) => `s${i}`)).size).toBe(12)
})

test('a crowded desk grows seat rows downwards, so no robot, name or tag overlaps another', () => {
  const roster = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, name: `agent${i}`, type: 'Explore', status: 'running' }))
  const cast = castOf({ ...empty, roster })
  const { seats } = seatsOf(cast, lay)
  const points = cast.map(a => seats.get(a.id)!)
  expect(points.length).toBe(5)
  for (const [i, p] of points.entries()) {
    for (const q of points.slice(i + 1)) {
      const apart = Math.abs(p.x - q.x) >= 8 || Math.abs(p.y - q.y) >= 5
      expect(apart).toBe(true)
    }
  }
  expect(new Set(points.map(p => p.y)).size).toBe(3)
})

test('the next row of desks starts below the tallest desk of the row above', () => {
  const sizes = [['', 5], ['A', 1], ['B', 1], ['C', 1], ['D', 1], ['E', 1]] as const
  const tall = layoutFor(84, 60)
  const desks = planDesks(sizes, tall)
  const first = desks.find(d => d.crew === '')!
  const sixth = desks.find(d => d.crew === 'E')!
  expect(sixth.at.y).toBeGreaterThanOrEqual(deskSeat(first.at, 4).y + 5)
})

test('seats that would reach into the log are left out instead of overlapping it', () => {
  const short = layoutFor(84, 26)
  const roster = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, name: `a${i}`, type: 'Explore', status: 'running' }))
  const { seats } = seatsOf(castOf({ ...empty, roster }), short)
  expect(seats.size).toBeLessThan(13)
  for (const p of seats.values()) expect(p.y + 5).toBeLessThanOrEqual(short.logDivider)
})

test('an action on no station after a file read never sends its query or url in the beacon', () => {
  const w = { ...empty, activity: { main: act({ tool: 'mcp__srv__search', target: 'secret query', spot: 'read', onFile: false }) } }
  expect(beaconOf('S', 'p', w, 1000).world.activity.main.target).toBe('')
  const read = { ...empty, activity: { main: act({ target: '/home/me/repo/src/a.ts' }) } }
  expect(beaconOf('S', 'p', read, 1000).world.activity.main.target).toBe('a.ts')
})

test('a peer log line from the future is dropped and cleaned keys cannot become __proto__', () => {
  const b = { v: 1 as const, id: 'S', name: 'p', at: 1000, world: { ...empty, log: [{ at: 999999, who: 'main', text: 'pinned' }] } }
  expect(mergeScene(empty, [b]).log).toEqual([])
  const raw = `{"v":1,"id":"S","name":"p","at":1,"world":{"activity":{"__pro\\u0001to__":${JSON.stringify(act())}},"links":[],"roster":[]}}`
  expect(Object.keys(parseBeacon(raw, 'S')?.world.activity ?? {})).toEqual([])
})

test('every width gets at least one desk row and stations that stay clear of the log', () => {
  for (const cols of [40, 44, 60, 84, 120, 200]) {
    const small = layoutFor(cols, minRowsFor(cols))
    const roster = [{ id: 'a1', name: 'a1', type: 'Explore', status: 'running' }]
    const { seats } = seatsOf(castOf({ ...empty, roster }), small)
    expect(seats.size).toBe(2)
    for (const s of small.stations.values()) expect(s.y + 7).toBeLessThan(small.logDivider)
  }
})

test('a compact map fits the opencode sidebar in fewer rows and keeps the same guarantees', () => {
  for (const cols of [32, 36, 38]) {
    const small = layoutFor(cols, minRowsFor(cols, true), true)
    expect(small.rows).toBeLessThan(minRowsFor(cols))
    const roster = [{ id: 'a1', name: 'a1', type: 'Explore', status: 'running' }]
    const { seats } = seatsOf(castOf({ ...empty, roster }), small)
    expect(seats.size).toBe(2)
    for (const s of small.stations.values()) {
      expect(s.y + 7).toBeLessThanOrEqual(small.deskTop)
      expect(s.x + small.stationW).toBeLessThanOrEqual(cols)
    }
  }
  expect(minRowsFor(36, true)).toBe(28)
})

test('quoted text, wrapper flags and script names do not fool test detection', () => {
  expect(isTestCommand('git commit -m "x && pytest -q"')).toBe(false)
  expect(isTestCommand("echo 'make test'")).toBe(false)
  expect(isTestCommand('timeout 60 pytest')).toBe(true)
  expect(isTestCommand('(cd role && molecule test)')).toBe(true)
  expect(isTestCommand('npm run test:unit')).toBe(true)
})

test('departed agents are forgotten and a busy count whose end was lost heals', () => {
  const roster = [{ id: 'live', name: 'live', type: 'Explore', status: 'running' }]
  const activity = {
    main: act({ at: 0 }),
    live: act({ at: 0 }),
    gone: act({ at: 0 }),
    stuck: act({ at: 0, busy: true, open: 2 }),
    fresh: act({ at: 3_590_000 }),
  }
  const w = pruned({ ...empty, roster, activity }, 3_600_000)
  expect(Object.keys(w.activity).sort()).toEqual(['fresh', 'live', 'main', 'stuck'])
  expect([w.activity.stuck.busy, w.activity.stuck.open]).toEqual([false, 0])
})

test('a peer cannot place its agents in the future, and shares only short names', () => {
  const remote = { ...empty, activity: { main: act({ at: 9_999_999, spotAt: 9_999_999 }) } }
  const w = mergeScene(empty, [{ v: 1, id: 'S', name: 'p', at: 5000, world: remote }])
  expect([w.activity['S:main'].at, w.activity['S:main'].spotAt]).toEqual([5000, 5000])
  const long = { ...empty, roster: [{ id: 'a', name: 'x'.repeat(200), type: 'Explore', status: 'running' }] }
  expect(beaconOf('S', 'p', long, 1).world.roster[0].name.length).toBeLessThanOrEqual(24)
})

test('a beacon from the opencode writer passes parseBeacon whole and seats its subagent at its own desk', () => {
  const raw =
    '{"v":1,"id":"oc-ses-r","name":"role","at":1791191208647,"world":{"activity":{"ses-c":{"tool":"read","target":"main.yml",' +
    '"spot":"read","spotAt":1791191207648,"onFile":true,"at":1791191207648,"busy":true,"waiting":false,"open":1,"count":1,' +
    '"thinking":false,"inTurn":true}},"roster":[{"id":"ses-c","name":"Explore","type":"subagent","status":"running"}],' +
    '"log":[{"at":1791191207648,"who":"ses-c","text":"takes its task"},{"at":1791191207648,"who":"ses-c","text":"reads main.yml"}],' +
    '"links":[]}}'
  const b = parseBeacon(raw, 'oc-ses-r')
  expect(b).toEqual(JSON.parse(raw))
  const cast = castOf(mergeScene({ activity: {}, links: [], roster: [], log: [] }, b ? [b] : []), 1791191208647)
  expect(cast.map(a => a.id)).toEqual(['main', 'oc-ses-r:main', 'oc-ses-r:ses-c'])
  expect(crewsOf(cast)).toEqual(['', 'oc-ses-r'])
})
