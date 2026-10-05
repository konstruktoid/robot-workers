import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const home = process.env.COPILOT_HOME || join(homedir(), '.copilot')
const hooks = join(home, 'hooks')
const writer = join(root, 'robot-workers.mjs')
const events = ['sessionStart', 'sessionEnd', 'userPromptSubmitted', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'agentStop', 'errorOccurred', 'subagentStart', 'subagentStop']
const config = {
  version: 1,
  hooks: Object.fromEntries(events.map(event => [event, [{ type: 'command', exec: process.execPath, args: [writer, event], timeoutSec: 3 }]])),
}

await mkdir(hooks, { recursive: true, mode: 0o700 })
await writeFile(join(hooks, 'robot-workers.json'), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
await chmod(join(hooks, 'robot-workers.json'), 0o600)
process.stdout.write(`Installed Copilot hooks in ${hooks}. Restart Copilot CLI to load them.\n`)
