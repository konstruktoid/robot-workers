# Beacon format

Every session that wants a desk on the robot-workers map writes one JSON file to:

```
${CLAUDE_CONFIG_DIR:-$HOME/.claude}/robot-workers/sessions/<id>.json
```

Three writers follow this format: the Claude Code plugin (`hooks/register.tsx`, using `beaconOf` in `hooks/scene.ts`),
the OpenCode plugin (`opencode/robot-workers.ts`) and the GitHub Copilot CLI hook (`copilot/robot-workers.mjs`). The
Claude Code and OpenCode writers rewrite their file about once a second; the Copilot hook rewrites it on each hook
event. Both readers, the Claude Code pane and the OpenCode sidebar (`opencode/frame.ts`), parse every file with
`parseBeacon` in `hooks/scene.ts`, which treats it as untrusted.

## Folder and file

- The folder is mode `0700` and owned by the writer's user; a symlink or a folder owned by anyone else is refused.
- `<id>` matches `^[A-Za-z0-9-]{1,64}$` and equals the `id` field. OpenCode ids are written as `oc-` plus the session id
  with every other character turned into `-`.
- A file is read only while its modification time and its `at` are both under 15 s old, and only up to 64 KiB.
- On exit a writer replaces its file with the same shape plus `"ended": true`; readers skip it at once.
- Files untouched for a day are deleted by the Claude Code plugin at session start.

## Shape

```json
{
  "v": 1,
  "id": "oc-ses-abc",
  "name": "ansible-role",
  "agent": "opencode",
  "at": 1791191208647,
  "world": {
    "activity": { "<actor>": Activity },
    "roster": [{ "id": "<actor>", "name": "Explore", "type": "subagent", "status": "running", "parentId": "<actor>" }],
    "log": [{ "at": 1791191207648, "who": "<actor>", "text": "reads main.yml" }],
    "links": [{ "from": "<actor>", "to": "<actor or name>", "kind": "message", "at": 1791191207648 }]
  }
}
```

- `name` is the desk label: the base name of the working directory.
- `agent` labels the session's main robot: the harness, such as `claude`, `opencode` or `copilot`. Optional; `main`
  when missing.
- `<actor>` is `main` for the session itself, otherwise a roster id. Ids carry no `:`; the reader adds `<id>:` itself.
- `parentId` is left out for a subagent of `main`.
- `Activity` has every field of `Activity` in `types/index.d.ts`: `tool`, `target`, `spot`, `spotAt`, `onFile`, `at`,
  `busy`, `waiting`, `open`, `count`, `thinking`, `inTurn`. A missing field drops the actor.
- `spot` is one of `read`, `search`, `edit`, `write`, `run`, `test`, `web`, `team`, `think`, or `''` to stay put.

## What must never be written

- Commands, queries, prompts, message bodies, or full paths. `target` is the base name of a file, and only when
  `onFile` is true and `spot` is `read`, `search`, `edit` or `write`; otherwise it is `''`.
- Log lines longer than one plain sentence. The writers keep the last 6 lines from the last minute.
- Names longer than 24 characters, or more than 32 actors.

## OpenCode

Two plugins, installed separately, because OpenCode loads server and TUI plugins from different places.

The beacon writer (`opencode/robot-workers.ts`) is a server plugin, linked into the global plugin folder (OpenCode
also loads the older singular `plugin/`):

```sh
mkdir -p ~/.config/opencode/plugins
ln -s /path/to/robot-workers/opencode/robot-workers.ts ~/.config/opencode/plugins/robot-workers.ts
```

Each top-level OpenCode session gets a desk; its child sessions (from the `task` tool) sit there as subagents. Test
detection in `isTestCommand` is copied from `hooks/scene.ts` and must be kept in step by hand.

The workshop view (`opencode/workshop.tsx`) is a TUI plugin. OpenCode reads TUI plugins only from `plugin` in
`~/.config/opencode/tui.json`; one placed in the plugin folder is refused by the server loader:

```json
{ "$schema": "https://opencode.ai/tui.json", "plugin": ["file:///path/to/robot-workers/opencode/workshop.tsx"] }
```

It sits in OpenCode's session sidebar (`sidebar_content`, order 150), directly below Context, as wide as the sidebar, in
the compact layout of `hooks/scene.ts` (about 27 rows). `/workshop` hides or shows it, and the choice is kept in
OpenCode's key-value store. It draws with the same `hooks/scene.ts` as the Claude Code pane and reads the beacons as
the pane does; it writes nothing, and OpenCode's own sessions reach it through their beacons.

The `*.node-test.ts` files hold the opencode-side tests, written for `node:test`. They need a Node built with type
stripping, or the files transpiled to `.mjs` first. The name keeps `claude plugin test`, which loads every `*.test.ts`,
from picking them up.

## GitHub Copilot CLI

`node copilot/install.mjs` installs a user-level hook configuration that invokes `copilot/robot-workers.mjs` for
Copilot's session, prompt, tool, error and subagent events. Its beacon id is `cp-` followed by a cleaned Copilot session
id. Each hook is a separate process, so the writer reads, updates and atomically replaces that session's beacon on every
event. It emits `{}` on standard output and exits successfully even when it cannot update a beacon, ensuring a visual
observer cannot affect a Copilot tool call.

The Copilot hook records only generic lifecycle log lines, tool categories and base names of file targets. It never
records the hook payload's prompts, tool commands or arguments outside an allowed file basename, tool results, errors or
subagent responses.
