import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const path = 'C:\\Users\\Riew\\.gemini\\antigravity-cli\\brain\\995d64e9-4445-4c39-917d-03e6e7581240\\.system_generated\\logs\\transcript_full.jsonl';

const rl = createInterface({
  input: createReadStream(path),
  crlfDelay: Infinity
});

for await (const line of rl) {
  const data = JSON.parse(line);
  if (data.step_index === 625 && data.type === 'VIEW_FILE') {
    console.log(data.content);
    break;
  }
}
