export type Activity = {
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
export type Link = { from: string; to: string; kind: 'message'; at: number }
export type LogLine = { at: number; who: string; text: string }
export type Member = { id: string; name: string; type: string; status: string; parentId?: string }
export type World = {
  activity: Record<string, Activity>
  links: Link[]
  roster: Member[]
  log: LogLine[]
}

export type Beacon = { v: 1; id: string; name: string; at: number; ended?: boolean; world: World }

declare module 'claude-code' {
  interface PluginState {
    'robot-workers': { world: World; peers: Beacon[] }
  }
}
