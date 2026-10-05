# robot-workers: cross-session map (implemented, awaiting live check)

Canonical source: /home/tsj/Code/Git/robot-workers. For hot reload, files are copied to
/home/tsj/.claude/dev-mods/65029a08-7f84-4fde-be9d-e234648f9490/robot-workers/ after each edit.

## Design
- Each session writes a beacon `${CLAUDE_CONFIG_DIR:-~/.claude}/robot-workers/sessions/<sessionId>.json` every 1 s:
  `{ v: 1, id, name (project basename), at, ended?, world }` with files trimmed to 40.
- Each session reads the folder every 1 s, skips its own, stale (>15 s) and ended beacons, stores them in atom `peers`.
- `mergeScene(local, peers)` folds remote worlds into one, ids prefixed `<sessionId>:`; files merge by path,
  so robots of different sessions meet at the same desk. Links are resolved to actor ids at merge time.
- session.end overwrites the beacon with `ended: true` (no delete API).
- Local `files` capped at 200.

## Done
- Beacon write/read, mergeScene, session.end marker, file cap; synced to dev-mods.
- Security pass: parseBeacon validates untrusted beacons (no casts, prototype keys dropped, control chars stripped,
  size/count caps), own() lookups, shell/web targets redacted from beacons, shared folder chmod 700.
- Thinking: turn.step generator marks thinking, turn.start/complete mark inTurn; robots sit at a per-session
  thinking desk (`∴ think`, remote `∴ think:<sid>`), go home only after the turn ends. 30 tests pass.

- Classroom layout: 8 shared action stations (read/search/edit/write/execute/test/web/agents) at the front,
  one thinking desk per session below (2 seats), barracks at the back; file desks and files map removed.
- Robots: 9 designs (5x6 px) from the user's reference sheet, picked per session by hash of the session id. 32 tests.

- Barracks replaced by a LOGS strip (last 5 lines; one sentence per action, no commands/queries; 6 recent lines
  shared in beacons). Idle robots sit at their session desk (seat per robot, 2 seats per desk). 35 tests.

- Desks grow seat rows downwards (2 per row); desk rows sized by fullest desk; seats crossing the log dropped.
- Review round 2 (4 subagents): beacon redaction requires onFile and sends base names; guarded state writes
  (remember()); bidi/zero-width stripped; key cleaned before prototype check; future timestamps rejected; read-time
  size cap; umask 077 + day-old beacon cleanup; isTestCommand matches runners in command position only. 62 tests.

- Review round 3: TS refactors (StationKey, isEnded, readonly, named constants, crewInk, normalise); ticker
  cancelled at session.end; sh script refuses relative/foreign/symlinked dir; beacon names and counts capped;
  pruned() forgets departed agents and heals lost busy counts; Unicode-class clean(); peer timestamps clamped;
  minRowsFor() guarantees one desk row; seatless robots still shown at stations; positions reset on resize;
  quote-aware isTestCommand. 73 tests (register, behavior, security, lifecycle).

## Next
- Live check: thinking desk and sitting pose; two sessions with the plugin (the other session needs a restart to load it).
- Optional: ListAgents presence for sessions without the plugin.

## Verify
claude plugin validate . && claude plugin test .

## Open questions
- Is `$.process.run(['sh', ...])` allowed without a prompt in a real session?

## opencode (2026-10-05)
- Done: beacon writer `opencode/robot-workers.ts` (linked in ~/.config/opencode/plugin/); workshop view
  `opencode/workshop.tsx` + `opencode/frame.ts` (listed in ~/.config/opencode/tui.json); pure map code moved from
  hooks/register.tsx to hooks/scene.ts (Scene class, Canvas.cell, castOf local flag, crewsOf without empty local desk,
  noUncheckedIndexedAccess-clean); BEACON.md; Claude beacons created 0600.
- Verify: `claude plugin validate . && claude plugin test .` (74 pass; dev-mods synced incl. scene.ts).
  opencode side: scratchpad oc/build.cjs transpiles to .mjs, then `node --test` (10 pass); oc/tsconfig.json type-checks
  writer/frame/workshop against opencode 1.18.18 types with solid/opentui shims. tsc for the plugin:
  `node ~/.npm/_npx/9056212c290a7802/node_modules/typescript/bin/tsc -p . --noEmit` (test files have old strict errors).
- Workshop moved from a /workshop route to opencode's sidebar_content slot (order 150, under Context); width measured
  from the box ref, text wrapMode none; /workshop toggles (kv key robot-workers.band). scene.ts gained a compact layout
  (layoutFor/minRowsFor `compact`: 4 stations a row, block 7, 3 log lines; 28 rows at 36 cols). 75 + 10 tests pass.
- Next: user to eyeball the compact sidebar in a real terminal (pty capture cannot show alignment).
- Open: hooks/*.test.ts strict-index type errors (pre-existing); README for install not written beyond BEACON.md.
