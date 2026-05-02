import fs from 'node:fs'
import path from 'node:path'

const contentPath = path.join(process.cwd(), 'data', 'site-content.json')

export function readContent() {
  const raw = fs.readFileSync(contentPath, 'utf-8')
  return JSON.parse(raw)
}

export function writeContent(payload) {
  fs.writeFileSync(contentPath, JSON.stringify(payload, null, 2), 'utf-8')
  return payload
}
