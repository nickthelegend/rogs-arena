import avatars from './avatars.json'
import frames from './frames.json'

function hashAddress(address: string) {
  let hash = 2166136261
  const seed = address.trim().toLowerCase()
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pickName(address: string, items: readonly { name: string }[], salt = '') {
  const hash = hashAddress(salt ? `${salt}:${address}` : address)
  return items[hash % items.length]?.name ?? items[0]?.name
}

export function getAvatar(address: string) {
  return `/avatars/${pickName(address, avatars)}`
}

export function getFrame(address: string) {
  return `/frames/${pickName(address, frames, 'frame')}`
}
