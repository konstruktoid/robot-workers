import { lstat, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'

import { BEACON_NAME, MAX_BEACON_BYTES, MAX_PEERS, STALE_MS, parseBeacon } from '../hooks/scene.ts'
import type { Canvas } from '../hooks/scene.ts'
import type { Beacon } from '../types/index.d.ts'

export type Run = { text: string; fg: string; bg: string }

export const beaconDir = (): string => `${process.env.CLAUDE_CONFIG_DIR || `${homedir()}/.claude`}/robot-workers/sessions`

const hex = (color: number): string => '#' + color.toString(16).padStart(6, '0')

// Every live session's beacon, Claude Code and OpenCode alike; each file is untrusted and checked as the pane does.
export const readBeacons = async (dir: string, now = Date.now()): Promise<Beacon[]> => {
  // The folder is read only when it is ours and not a link, as the Claude Code side requires before it writes.
  const top = await lstat(dir).catch(() => undefined)
  if (!top?.isDirectory() || top.uid !== process.getuid?.()) return []
  const names = await readdir(dir).catch((): string[] => [])
  const fresh: { id: string; name: string; mtimeMs: number }[] = []
  for (const name of names) {
    const id = BEACON_NAME.exec(name)?.[1]
    if (!id) continue
    const st = await lstat(`${dir}/${name}`).catch(() => undefined)
    if (!st?.isFile() || st.size > MAX_BEACON_BYTES || Math.abs(now - st.mtimeMs) >= STALE_MS) continue
    fresh.push({ id, name, mtimeMs: st.mtimeMs })
  }
  fresh.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const found: Beacon[] = []
  for (const f of fresh.slice(0, MAX_PEERS)) {
    const raw = await readFile(`${dir}/${f.name}`, 'utf8').catch(() => '')
    const b = raw.length <= MAX_BEACON_BYTES ? parseBeacon(raw, f.id) : undefined
    if (b && Math.abs(now - b.at) < STALE_MS) found.push(b)
  }
  return found.sort((a, b) => a.id.localeCompare(b.id))
}

// Each row as runs of one colour pair, so a frame is a few hundred spans rather than one per cell.
export const rowsOf = (c: Canvas): Run[][] => {
  const rows: Run[][] = []
  for (let y = 0; y < c.rows; y++) {
    const runs: Run[] = []
    for (let x = 0; x < c.cols; x++) {
      const [cp, fg, bg] = c.cell(x, y)
      const [text, fore, back] = [String.fromCodePoint(cp), hex(fg), hex(bg)]
      const last = runs[runs.length - 1]
      if (last && last.fg === fore && last.bg === back) last.text += text
      else runs.push({ text, fg: fore, bg: back })
    }
    rows.push(runs)
  }
  return rows
}
