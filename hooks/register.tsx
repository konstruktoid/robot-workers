import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Beacon, World } from '../types'

import { base, BEACON_EVERY, BEACON_NAME, beaconOf, castOf, clip, count, crewOf, describe, EMPTY, isRecord, layoutFor, LEGEND_ROWS, LEGEND_W, list, logged, MAIN, MAP_COLS,MAX_BEACON_BYTES, MAX_COLS, MAX_LINKS, MAX_PEERS, MAX_ROWS, mergeScene, MIN_COLS, MIN_ROWS, minRowsFor, normalise, own, parseBeacon, pruned, ROSTER_EVERY, Scene, SCREEN_CHROME, SESSION_ID, setTurn, short, spotOf, STALE_MS, startThinking, STEP_MS, targetOf } from './scene'
import type { Layout } from './scene'

const PANE = 'workers'
const RASTER = 'map'
const NO_PEERS: Beacon[] = []
const world = atom({ plugin: 'robot-workers', key: 'world' } as const, EMPTY)
const peers = atom({ plugin: 'robot-workers', key: 'peers' } as const, NO_PEERS)

// The map is decoration: a failed state write is dropped rather than failing the tool call or step it observes.
async function remember($: EngineInterface, change: (w: World) => World): Promise<void> {
  try {
    await update($, world, w => change(normalise(w)))
  } catch {
    // The next event writes the state again.
  }
}

async function sendBeacon($: EngineInterface, dir: string, name: string): Promise<void> {
  try {
    const sid = await $.session.id()
    if (!SESSION_ID.test(sid)) return
    await $.fs.write(`${dir}/${sid}.json`, JSON.stringify(beaconOf(sid, name, normalise(await read($, world)), Date.now())))
  } catch {
    // A missed beacon only makes this session look stale to the others for a moment.
  }
}

// Returns the text of what it found, so the caller writes the atom only when another session changed.
async function readPeers($: EngineInterface, dir: string, last: string): Promise<string> {
  try {
    const sid = await $.session.id()
    const now = Date.now()
    const fresh = (await $.fs.list(dir))
      .filter(f => f.kind === 'file' && f.size <= MAX_BEACON_BYTES && Math.abs(now - f.mtimeMs) < STALE_MS)
      .flatMap(f => {
        const id = BEACON_NAME.exec(f.name)?.[1]
        return id && id !== sid ? [{ id, name: f.name, mtimeMs: f.mtimeMs }] : []
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, MAX_PEERS)
    const found: Beacon[] = []
    for (const f of fresh) {
      try {
        const raw = String(await $.fs.read(`${dir}/${f.name}`))
        const b = raw.length <= MAX_BEACON_BYTES ? parseBeacon(raw, f.id) : undefined
        if (b && Math.abs(now - b.at) < STALE_MS) found.push(b)
      } catch {
        // A beacon removed between the listing and the read is skipped.
      }
    }
    found.sort((a, b) => a.id.localeCompare(b.id))
    const text = JSON.stringify(found.map(b => ({ ...b, at: 0 })))
    if (text !== last) await update($, peers, () => found)
    return text
  } catch {
    // No folder yet, or a failed read or write; the peers on the map stay as they were until the next pass.
    return last
  }
}

export const register: Register = on => {
  let mounted: { cols: number; rows: number } | undefined
  let tick = 0
  let ticking = false
  let lastRoster = ''
  let lastPeers = ''
  let shared: string | undefined
  let here = 'session'
  let self = ''
  let ticker: { cancel: () => void } | undefined
  const scene = new Scene()
  const paint = (w: World, lay: Layout, now: number, advance: boolean): string =>
    scene.paint(w, lay, now, advance, here, self).encode()

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'workers', description: 'Show the robot workshop pane' }).catch(() => undefined)
    $.ui.open({ id: PANE, title: 'Workshop', columns: MAP_COLS + 2 }).catch(() => undefined)
    try {
      here = base(await $.session.root())
      self = await $.session.id()
      // Used only when absolute, ours, not a link and private; beacons older than a day are from long-gone sessions.
      // The beacon is made 0600 here because $.fs.write takes no mode and rewrites an existing file in place.
      const found = SESSION_ID.test(self)
        ? await $.process.run([
            'sh',
            '-c',
            'umask 077; d="${CLAUDE_CONFIG_DIR:-${HOME:?}/.claude}/robot-workers/sessions"; case "$d" in /*) ;; *) exit 1;; esac; f="$d/$1.json"; mkdir -p "$d" && [ ! -L "$d" ] && [ -O "$d" ] && chmod 700 "$d" && [ ! -L "$f" ] && { [ -e "$f" ] || : > "$f"; } && chmod 600 "$f" && { find "$d" -maxdepth 1 -type f -name "*.json" -mmin +1440 -delete; printf %s "$d"; }',
            'sh',
            self,
          ])
        : undefined
      if (found?.exitCode === 0 && found.stdout.startsWith('/')) shared = found.stdout
    } catch {
      // Without a shared folder the map shows this session alone.
    }
    ticker?.cancel()
    ticker = $.clock.every(STEP_MS, () => {
      if (ticking) return
      ticking = true
      void (async () => {
        try {
          tick++
          if (tick % ROSTER_EVERY === 0) {
            try {
              const roster = (await $.agent.list()).map(a => ({
                id: a.id,
                name: a.name ?? a.description ?? a.type,
                type: a.type,
                status: a.status,
                parentId: a.parentId,
              }))
              const text = JSON.stringify(roster)
              if (text !== lastRoster) {
                lastRoster = text
                await update($, world, w => ({ ...w, roster }))
              }
            } catch {
              // The last roster stays on the map until the next poll succeeds.
            }
          }
          if (shared && tick % BEACON_EVERY === 0) await sendBeacon($, shared, here)
          if (shared && tick % BEACON_EVERY === BEACON_EVERY / 2) lastPeers = await readPeers($, shared, lastPeers)
          const size = mounted
          if (!size) return
          const w = mergeScene(normalise(await read($, world)), await read($, peers))
          const cells = paint(w, layoutFor(size.cols, size.rows), Date.now(), true)
          const done = await $.ui.blit({ requestId: PANE, key: RASTER, cells })
          // A refused blit means the pane is closed or resized, and the next render of it sets the size again.
          if ('deny' in done && mounted === size) mounted = undefined
        } catch {
          // A failed frame is dropped and the next tick draws again.
        } finally {
          ticking = false
        }
      })()
    })

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    ticker?.cancel()
    const dir = shared
    shared = undefined
    if (dir && SESSION_ID.test(e.sessionId)) {
      const ended: Beacon = { v: 1, id: e.sessionId, name: here, at: Date.now(), ended: true, world: EMPTY }
      await $.fs.write(`${dir}/${e.sessionId}.json`, JSON.stringify(ended)).catch(() => undefined)
    }

    return next(e)
  })

  on('command.run', { command: 'workers' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Workshop', columns: MAP_COLS + 2 })

    return { text: 'Workshop pane opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const who = e.agentId ?? MAIN
    const input: Record<string, unknown> = isRecord(e) ? e : {}
    const what = targetOf(input)
    const spot = spotOf(e.tool, typeof input.command === 'string' ? input.command : '')
    const now = Date.now()
    await remember($, w => {
      const prior = own(w.activity, who)
      const out: World = {
        ...w,
        activity: {
          ...w.activity,
          [who]: {
            tool: e.tool,
            target: what,
            spot: spot || prior?.spot || '',
            spotAt: spot ? now : (prior?.spotAt ?? now),
            onFile: !!spot,
            at: now,
            busy: true,
            waiting: false,
            thinking: false,
            inTurn: prior?.inTurn ?? false,
            open: (prior?.open ?? 0) + 1,
            count: (prior?.count ?? 0) + 1,
          },
        },
      }
      if (e.tool === 'SendMessage' && what) {
        out.links = [...w.links, { from: who, to: what, kind: 'message' as const, at: now }].slice(-MAX_LINKS)
      }
      return pruned(logged(out, who, describe(e.tool, spot, what), now), now)
    })
    try {
      return await next(e)
    } finally {
      await remember($, w => {
        const act = own(w.activity, who)
        if (!act) return w
        const open = Math.max(0, act.open - 1)
        return { ...w, activity: { ...w.activity, [who]: { ...act, open, busy: open > 0, waiting: open > 0 && act.waiting, at: Date.now() } } }
      })
    }
  })

  on('turn.start', async ($, e, next) => {
    await remember($, w => logged(setTurn(w, MAIN, { inTurn: true }, Date.now()), MAIN, 'takes a new prompt', Date.now()))

    return next(e)
  })

  // A step is one model request: the agent thinks from its start until its stream ends.
  on('turn.step', async function* ($, e, next) {
    const who = e.agentId ?? MAIN
    await remember($, w => startThinking(w, who, Date.now()))
    try {
      return yield* next(e)
    } finally {
      await remember($, w => setTurn(w, who, { thinking: false }, Date.now()))
    }
  })

  on('turn.complete', async ($, e, next) => {
    const who = e.agentId ?? MAIN
    await remember($, w => {
      const done = setTurn(w, who, { thinking: false, inTurn: false }, Date.now())
      return done === w ? w : logged(done, who, 'finishes its turn and goes idle', Date.now())
    })

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const Raster = e.surface === 'terminal' ? $.ui.resolve(e).Raster : undefined
    const others = await read($, peers)
    const w = mergeScene(normalise(await read($, world)), others)
    const cast = castOf(w)
    // The map and its log replace the text legend; surfaces without a Raster keep the legend as their only view.
    const legend = Raster ? [] : cast.slice(0, LEGEND_ROWS)
    const crewName = new Map(others.map(b => [b.id, b.name]))
    // The pane's own body size when the engine gives it; the screen less its chrome is only a fallback.
    const props: unknown = e.props
    const bodyColumns = isRecord(props) ? count(props.bodyColumns) : undefined
    const bodyRows = isRecord(props) && isRecord(props.scroll) ? count(props.scroll.bodyRows) : undefined
    const cols = Math.min(MAX_COLS, Math.max(bodyColumns ?? (e.viewport?.columns ?? 80) - 2, MIN_COLS))
    const rows = Math.min(MAX_ROWS, Math.max((bodyRows ?? (e.viewport?.rows ?? 40) - SCREEN_CHROME) - legend.length, MIN_ROWS, minRowsFor(cols)))
    const lay = layoutFor(cols, rows)
    if (Raster) mounted = { cols, rows }

    return (
      <Box flexDirection="column">
        {Raster && <Raster key={RASTER} columns={cols} rows={rows} cells={paint(w, lay, Date.now(), false)} />}
        {legend.map(a => {
          const act = own(w.activity, a.id)
          const who = crewOf(a.id) ? `${crewName.get(crewOf(a.id)) ?? '?'}›${a.name}` : a.name
          const doing = !act
            ? '· idle'
            : act.thinking && !act.busy
              ? '∴ thinking'
              : `${act.waiting ? '?' : act.busy ? '▶' : '·'} ${act.tool} ${short(act.target, 40)}`
          return (
            <Text key={a.id} dimColor={!act?.busy && !act?.thinking}>
              {clip(who, LEGEND_W).padEnd(LEGEND_W)} {doing}
            </Text>
          )
        })}
        {!Raster && cast.length > legend.length && <Text dimColor>+{cast.length - legend.length} more</Text>}
      </Box>
    )
  })
}
