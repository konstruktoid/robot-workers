import { expect, test } from 'claude-code/testing'

import { clean, describe as describeAction, parseBeacon, printable, spotOf } from './scene'
import type { Activity } from '../types'

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

const beacon = (world: unknown, over: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 1, id: 'S', name: 'p', at: 1, world, ...over })

const emptyWorld = { activity: {}, links: [], roster: [], log: [] }

test('a beacon whose world is an array, a string or null is refused', () => {
  for (const world of [[], [emptyWorld], 'world', 7, null, true]) {
    expect(parseBeacon(beacon(world), 'S')).toBeUndefined()
  }
})

test('wrong-typed top-level fields are refused', () => {
  for (const over of [{ name: 5 }, { name: null }, { name: {} }, { at: '1' }, { at: null }, { v: '1' }, { v: 2 }, { id: ['S'] }]) {
    expect(parseBeacon(beacon(emptyWorld, over), 'S')).toBeUndefined()
  }
})

test('non-finite numbers never survive parsing', () => {
  // JSON cannot carry NaN or Infinity, so the nearest forms are null and an overflowing literal.
  expect(parseBeacon(`{"v":1,"id":"S","name":"p","at":1e999,"world":${JSON.stringify(emptyWorld)}}`, 'S')).toBeUndefined()
  expect(parseBeacon(beacon(emptyWorld, { at: null }), 'S')).toBeUndefined()
  const raw = `{"v":1,"id":"S","name":"p","at":1,"world":{"activity":{"x":${JSON.stringify(act()).replace('"count":1', '"count":1e999')}},"links":[{"from":"a","to":"b","kind":"message","at":1e999}],"roster":[],"log":[{"at":1e999,"who":"a","text":"t"}]}}`
  const b = parseBeacon(raw, 'S')
  expect(b?.world.activity).toEqual({})
  expect(b?.world.links).toEqual([])
  expect(b?.world.log).toEqual([])
})

test('every string field is capped', () => {
  const long = 'x'.repeat(100_000)
  const b = parseBeacon(
    beacon({
      activity: { [long]: act({ tool: long, target: long, spot: long }) },
      links: [{ from: long, to: long, kind: 'message', at: 1 }],
      roster: [{ id: long, name: long, type: long, status: long, parentId: long }],
      log: [{ at: 1, who: long, text: long }],
    }, { name: long }),
    'S',
  )
  expect(b).toBeDefined()
  expect(b!.name.length).toBeLessThanOrEqual(64)
  const [[key, a]] = Object.entries(b!.world.activity)
  expect(key.length).toBeLessThanOrEqual(256)
  expect(a.tool.length).toBeLessThanOrEqual(64)
  expect(a.target.length).toBeLessThanOrEqual(256)
  expect(a.spot.length).toBeLessThanOrEqual(64)
  expect(b!.world.links[0].from.length).toBeLessThanOrEqual(128)
  expect(b!.world.links[0].to.length).toBeLessThanOrEqual(128)
  const m = b!.world.roster[0]
  expect([m.id.length, m.name.length, m.type.length, m.status.length, m.parentId!.length]).toEqual([128, 64, 64, 32, 128])
  expect(b!.world.log[0].who.length).toBeLessThanOrEqual(128)
  expect(b!.world.log[0].text.length).toBeLessThanOrEqual(120)
})

test('list and record sizes are bounded', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => i)
  const b = parseBeacon(
    beacon({
      activity: Object.fromEntries(many(5000).map(i => [`k${i}`, act()])),
      links: many(5000).map(i => ({ from: 'a', to: 'b', kind: 'message', at: i })),
      roster: many(5000).map(i => ({ id: `r${i}`, name: 'n', type: 't', status: 's' })),
      log: many(5000).map(i => ({ at: i, who: 'a', text: 't' })),
    }),
    'S',
  )
  expect(Object.keys(b!.world.activity).length).toBeLessThanOrEqual(32)
  expect(b!.world.links.length).toBeLessThanOrEqual(8)
  expect(b!.world.roster.length).toBeLessThanOrEqual(32)
  expect(b!.world.log.length).toBeLessThanOrEqual(6)
})

test('deeply nested junk is handled without throwing', () => {
  const depth = 5000
  const deep = '['.repeat(depth) + ']'.repeat(depth)
  const nested = '{"a":'.repeat(depth) + '1' + '}'.repeat(depth)
  for (const junk of [deep, nested]) {
    const raw = `{"v":1,"id":"S","name":"p","at":1,"world":{"activity":{"x":{"tool":${junk}}},"links":[${junk}],"roster":[${junk}],"log":[${junk}]}}`
    expect(() => parseBeacon(raw, 'S')).not.toThrow()
    const b = parseBeacon(raw, 'S')
    expect(b?.world.activity).toEqual({})
    expect(b?.world.roster).toEqual([])
  }
  expect(() => parseBeacon(deep + deep, 'S')).not.toThrow()
  expect(parseBeacon('', 'S')).toBeUndefined()
  expect(parseBeacon('null', 'S')).toBeUndefined()
})

test('a huge but valid beacon parses quickly', () => {
  const big = 'y'.repeat(2_000_000)
  const t0 = Date.now()
  const b = parseBeacon(beacon(emptyWorld, { name: big }), 'S')
  expect(Date.now() - t0).toBeLessThan(500)
  expect(b?.name.length).toBe(64)
})

test('prototype keys are dropped or inert at every level', () => {
  const raw = `{"v":1,"id":"S","name":"p","at":1,"__proto__":{"polluted":1},"constructor":{"x":1},"world":{
    "__proto__":{"polluted":1},
    "activity":{"__proto__":${JSON.stringify(act())},"constructor":${JSON.stringify(act())},"prototype":${JSON.stringify(act())},"ok":${JSON.stringify(act())}},
    "links":[{"__proto__":{"x":1},"from":"a","to":"b","kind":"message","at":1}],
    "roster":[{"__proto__":{"polluted":1},"id":"r","name":"n","type":"t","status":"s","constructor":"c"}],
    "log":[{"__proto__":{"polluted":1},"at":1,"who":"a","text":"t","constructor":{}}]}}`
  const b = parseBeacon(raw, 'S')
  expect(Object.keys(b!.world.activity)).toEqual(['ok'])
  expect(Object.keys(b!)).toEqual(['v', 'id', 'name', 'at', 'world'])
  expect(Object.keys(b!.world.roster[0]).sort()).toEqual(['id', 'name', 'status', 'type'])
  expect(Object.keys(b!.world.log[0]).sort()).toEqual(['at', 'text', 'who'])
  expect(Object.keys(b!.world.links[0]).sort()).toEqual(['at', 'from', 'kind', 'to'])
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  expect(Object.getPrototypeOf(b)).toBe(Object.prototype)
  expect(Object.getPrototypeOf(b!.world.activity)).toBe(Object.prototype)
  expect(Object.getPrototypeOf(b!.world.roster[0])).toBe(Object.prototype)
  expect(Object.getPrototypeOf(b!.world.log[0])).toBe(Object.prototype)
})

test('an activity key that becomes a prototype key after cleaning is still inert', () => {
  const raw = beacon({ activity: { '__pro\u0000to__': act(), 'constructor\u0007': act() }, links: [], roster: [], log: [] })
  const b = parseBeacon(raw, 'S')
  expect(Object.getPrototypeOf(b!.world.activity)).toBe(Object.prototype)
  expect(Object.getPrototypeOf(b!.world.activity)).toBe(Object.prototype)
  expect(({} as Record<string, unknown>).tool).toBeUndefined()
  expect(Object.hasOwn(b!.world.activity, 'toString')).toBe(false)
})

test('wrong-typed entries inside lists are skipped and never throw', () => {
  const junk = [null, 0, 'x', true, [], [[]], {}, { id: {} }, { at: 'x' }]
  const b = parseBeacon(beacon({ activity: { a: null, b: 'x', c: [] }, links: junk, roster: junk, log: junk }), 'S')
  expect(b?.world).toEqual(emptyWorld)
  const c = parseBeacon(beacon({ activity: [act()], links: {}, roster: 'r', log: 5 }), 'S')
  expect(c?.world).toEqual(emptyWorld)
})

test('control characters and escapes in beacon strings are stripped', () => {
  const b = parseBeacon(beacon(emptyWorld, { name: 'a\u001b]0;pwn\u0007b\u009b31mc\u0085d\r\ne' }), 'S')
  expect(b?.name).toBe('a]0;pwnb31mcde')
  expect(/[\u0000-\u001f\u007f-\u009f]/.test(b!.name)).toBe(false)
})

test('clean removes C1 controls and escape sequences, keeps text, and honors the length cap', () => {
  expect(clean('\u0080\u0090\u009b[2Jx\u009d0;t\u009cy\u007f')).toBe('[2Jx0;ty')
  expect(clean('\u001b[31mred\u001b[0m')).toBe('[31mred[0m')
  expect(clean('\u001b\u001b\u001b')).toBe('')
  expect(clean('a'.repeat(1_000_000)).length).toBe(256)
  expect(clean('abc', 0)).toBe('')
  expect(clean('é ü')).toBe('é ü')
})

test('clean and the parser strip lone surrogates without throwing', () => {
  const lone = 'a\ud800b\udc00c'
  expect(clean(lone)).toBe('abc')
  expect(() => parseBeacon(beacon(emptyWorld, { name: lone }), 'S')).not.toThrow()
  expect(parseBeacon(`{"v":1,"id":"S","name":"\\ud800","at":1,"world":${JSON.stringify(emptyWorld)}}`, 'S')?.name.length).toBe(0)
})

test('printable replaces surrogates, astral characters, controls and wide glyphs with a question mark', () => {
  expect(printable('\ud800')).toBe(0x3f)
  expect(printable('\udfff')).toBe(0x3f)
  expect(printable('😀')).toBe(0x3f)
  expect(printable('😀')).toBe(0x3f)
  expect(printable('\u0000')).toBe(0x3f)
  expect(printable('\u001b')).toBe(0x3f)
  expect(printable('\u007f')).toBe(0x3f)
  expect(printable('\u0085')).toBe(0x3f)
  expect(printable('‮')).toBe(0x3f)
  expect(printable('中')).toBe(0x3f)
  expect(printable('')).toBe(0x3f)
  expect(printable('A')).toBe(0x41)
  expect([...'𐀀\ud83d'].every(ch => printable(ch) === 0x3f)).toBe(true)
})

test('spotOf stays fast on adversarial Bash commands of 100k characters', () => {
  const inputs = [
    'a'.repeat(100_000),
    ' '.repeat(100_000),
    'go '.repeat(33_000),
    'npm run '.repeat(12_500),
    'pytes'.repeat(20_000),
    'x'.repeat(99_990) + ' pytest',
    '\u0000'.repeat(100_000),
    'é'.repeat(100_000),
    '\ud800'.repeat(100_000),
  ]
  for (const tool of ['Bash', 'PowerShell']) {
    for (const input of inputs) {
      const t0 = performance.now()
      spotOf(tool, input)
      expect(performance.now() - t0).toBeLessThan(50)
    }
  }
})

test('a test runner past the first 300 characters is not detected', () => {
  expect(spotOf('Bash', 'x'.repeat(400) + '; pytest')).toBe('run')
  expect(spotOf('Bash', 'x'.repeat(100) + '; pytest')).toBe('test')
})

test('commands that only mention test words as arguments are not treated as a test run', () => {
  for (const cmd of ['ls tests', 'cat latest.txt', 'git status', 'echo testing', 'cd test && ls']) {
    expect(spotOf('Bash', cmd)).toBe('run')
  }
})

test('substrings of test words do not trigger the test station', () => {
  for (const cmd of ['pytestx', 'mypytest', 'contest', 'latest', 'npm run testing', 'gonetest', 'make tests', 'cargo testify']) {
    expect(spotOf('Bash', cmd)).toBe('run')
  }
})

test('the tool decides the station even when the command names a test runner or a path', () => {
  expect(spotOf('Read', 'pytest')).toBe('read')
  expect(spotOf('WebFetch', 'pytest')).toBe('web')
  expect(spotOf('Bash')).toBe('run')
  expect(spotOf('__proto__', 'pytest')).toBe('')
  expect(spotOf('constructor')).toBe('')
  expect(spotOf('bash', 'pytest')).toBe('')
})

test('describe never leaks a command, query or message body', () => {
  const secret = 'SECRET-TOKEN-hunter2'
  const cmd = `curl -H "Authorization: ${secret}" https://x.test`
  expect(describeAction('Bash', 'run', cmd)).toBe('runs a command')
  expect(describeAction('Bash', 'test', cmd)).toBe('runs the tests')
  expect(describeAction('WebSearch', 'web', secret)).toBe('searches the web')
  expect(describeAction('WebFetch', 'web', `https://x.test/?k=${secret}`)).toBe('fetches a web page')
  expect(describeAction('Agent', 'team', secret)).toBe('starts a subagent')
  expect(describeAction('TaskStop', 'team', secret)).toBe('checks on its team')
  for (const tool of ['Bash', 'PowerShell']) {
    for (const spot of ['run', 'test']) {
      expect(describeAction(tool, spot, cmd).includes(secret)).toBe(false)
    }
  }
})

test('describe bounds and cleans file names and tool names', () => {
  const evil = '/tmp/\u001b[2J' + 'z'.repeat(100_000) + '\u009b.ts'
  for (const spot of ['read', 'search', 'edit', 'write']) {
    const out = describeAction('Read', spot, evil)
    expect(out.length).toBeLessThan(80)
    expect(/[\u0000-\u001f\u007f-\u009f]/.test(out)).toBe(false)
  }
  const tool = describeAction('mcp__evil__\u001b[31m' + 'n'.repeat(100_000), '', '')
  expect(tool.length).toBeLessThan(80)
  expect(/[\u0000-\u001f\u007f-\u009f]/.test(tool)).toBe(false)
  expect(describeAction('SendMessage', 'team', 'bob\u0007'.repeat(10_000)).length).toBeLessThan(80)
  expect(() => describeAction('Read', 'read', '\ud800'.repeat(1000))).not.toThrow()
  expect(describeAction('Read', 'read', '')).toBe('reads a file')
})
