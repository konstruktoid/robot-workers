import type { TuiPlugin, TuiPluginApi } from '@opencode-ai/plugin/tui'
import { createSignal, For, onCleanup, Show } from 'solid-js'

import { EMPTY, STEP_MS, Scene, layoutFor, mergeScene, minRowsFor } from '../hooks/scene.ts'
import type { Beacon } from '../types/index.d.ts'
import { beaconDir, readBeacons, rowsOf } from './frame.ts'
import type { Run } from './frame.ts'

// The robot-workers map in opencode's session sidebar; it only reads the beacons that every session writes.

const SHOWN_KEY = 'robot-workers.band'
const READ_MS = 1000
// Used until opencode has laid the sidebar out and the box knows its own width.
const FALLBACK_COLS = 36
const NARROWEST = 30
// Directly below the sidebar's own Context block, which opencode registers at order 100.
const SIDEBAR_ORDER = 150

const Workshop = (props: { api: TuiPluginApi }) => {
  const scene = new Scene()
  const dir = beaconDir()
  let peers: Beacon[] = []
  let reading = false
  let box: { width?: number } | undefined

  const draw = (): Run[][] => {
    const width = box?.width ?? 0
    const cols = width >= NARROWEST ? Math.floor(width) : FALLBACK_COLS
    const w = mergeScene(EMPTY, peers)
    return rowsOf(scene.paint(w, layoutFor(cols, minRowsFor(cols, true), true), Date.now(), true, '', '', false))
  }

  const [frame, setFrame] = createSignal(draw())
  const read = async () => {
    if (reading) return
    reading = true
    try {
      peers = await readBeacons(dir)
    } catch {
      // The robots stay as they were until the next read.
    } finally {
      reading = false
    }
  }
  void read()
  const reader = setInterval(() => void read(), READ_MS)
  const ticker = setInterval(() => setFrame(draw()), STEP_MS)
  onCleanup(() => {
    clearInterval(reader)
    clearInterval(ticker)
  })

  return (
    <box flexDirection="column" ref={(r: { width?: number }) => (box = r)}>
      <For each={frame()}>
        {runs => (
          <text wrapMode="none">
            <For each={runs}>{run => <span style={{ fg: run.fg, bg: run.bg }}>{run.text}</span>}</For>
          </text>
        )}
      </For>
    </box>
  )
}

const tui: TuiPlugin = async api => {
  // The local signal answers at once even if the host's key-value store is not reactive.
  const [choice, setChoice] = createSignal<boolean | undefined>(undefined)
  const shown = (): boolean => choice() ?? api.kv.get(SHOWN_KEY, true)

  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content: () => (
        <Show when={shown()}>
          <Workshop api={api} />
        </Show>
      ),
    },
  })
  api.command?.register(() => [
    {
      title: 'Toggle robot workshop',
      value: 'robot-workers.workshop',
      description: 'Show or hide the robots of every Claude Code, Copilot CLI and opencode session in the sidebar',
      category: 'View',
      slash: { name: 'workshop' },
      onSelect: () => {
        const next = !shown()
        setChoice(next)
        api.kv.set(SHOWN_KEY, next)
      },
    },
  ])
}

export default { id: 'robot-workers-workshop', tui }
