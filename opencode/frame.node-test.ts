import assert from 'node:assert/strict'
import { mkdtemp, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { test } from 'node:test'

import { EMPTY, Scene, layoutFor, mergeScene } from '../hooks/scene.ts'
import { readBeacons, rowsOf } from './frame.ts'

const beacon = (id: string, at = Date.now()) =>
  JSON.stringify({ v: 1, id, name: 'role', at, world: { activity: {}, links: [], roster: [], log: [] } })

test('only fresh, well-named, regular beacon files that parse are read', async () => {
  const dir = await mkdtemp(`${tmpdir()}/robot-workers-frame-`)
  await writeFile(`${dir}/good-1.json`, beacon('good-1'))
  await writeFile(`${dir}/wrong-id.json`, beacon('other'))
  await writeFile(`${dir}/bad_name.json`, beacon('bad_name'))
  await writeFile(`${dir}/stale.json`, beacon('stale'))
  const old = new Date(Date.now() - 60000)
  await utimes(`${dir}/stale.json`, old, old)
  await writeFile(`${dir}/old-at.json`, beacon('old-at', Date.now() - 60000))
  await writeFile(`${dir}/huge.json`, beacon('huge').padEnd(70000))
  await symlink(`${dir}/good-1.json`, `${dir}/linked.json`)
  const found = await readBeacons(dir)
  assert.deepEqual(found.map(b => b.id), ['good-1'])
})

test('a missing folder reads as no beacons', async () => {
  assert.deepEqual(await readBeacons('/nonexistent/robot-workers/sessions'), [])
})

test('a frame has one row per map row, each exactly as wide as the map, in merged colour runs', () => {
  const peers = [JSON.parse(beacon('S-1'))]
  const c = new Scene().paint(mergeScene(EMPTY, peers), layoutFor(84, 30), Date.now(), true, '', '', false)
  const rows = rowsOf(c)
  assert.equal(rows.length, 30)
  for (const runs of rows) assert.equal([...runs.map(r => r.text).join('')].length, 84)
  assert.ok(rows.flat().length < 84 * 30 / 2)
  assert.match(rows[0]?.map(r => r.text).join('') ?? '', /STATIONS/)
  for (const run of rows.flat()) assert.match(`${run.fg}${run.bg}`, /^#[0-9a-f]{6}#[0-9a-f]{6}$/)
})

test('without a local session no desk is drawn for one, and a peer gets the first desk', () => {
  const peers = [JSON.parse(beacon('S-1'))]
  const text = rowsOf(new Scene().paint(mergeScene(EMPTY, peers), layoutFor(84, 30), Date.now(), true, '', '', false))
    .map(r => r.map(x => x.text).join(''))
    .join('\n')
  assert.match(text, /role/)
  assert.doesNotMatch(text, /session/)
})
