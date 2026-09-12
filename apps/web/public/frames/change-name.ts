import { readdir, rename, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AVATARS_DIR = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(AVATARS_DIR, 'avatars.json')
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const ID_PATTERN = /^[0-9a-f]{6}$/

type AvatarEntry = {
  id: string
  name: string
}

function createId(used: Set<string>) {
  let id = ''
  do {
    id = randomBytes(3).toString('hex')
  } while (used.has(id))
  used.add(id)
  return id
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

const images = (await readdir(AVATARS_DIR))
  .filter((name) => IMAGE_EXT.has(extname(name).toLowerCase()))
  .sort(naturalCompare)

const used = new Set<string>()
const manifest: AvatarEntry[] = []

for (const file of images) {
  const ext = extname(file).toLowerCase()
  const stem = file.slice(0, -ext.length)

  if (ID_PATTERN.test(stem) && ext === '.png') {
    used.add(stem)
    manifest.push({ id: stem, name: file })
    continue
  }

  const id = createId(used)
  const nextName = `${id}.png`
  await rename(join(AVATARS_DIR, file), join(AVATARS_DIR, nextName))
  manifest.push({ id, name: nextName })
}

await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Wrote ${manifest.length} avatars → ${MANIFEST_PATH}`)
