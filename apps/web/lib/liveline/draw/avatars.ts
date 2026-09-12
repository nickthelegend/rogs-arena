export interface DrawnAvatar {
  x: number
  y: number
  color: string
  avatar: string
  name?: string
  appear: number
}

const AVATAR_RADIUS = 10
const AVATAR_RING = 2.25
const LIVE_TIP_CLEARANCE = 18

type CacheEntry = { img: HTMLImageElement; status: 'loading' | 'ready' | 'error' }

const imageCache = new Map<string, CacheEntry>()

function getAvatarImage(src: string): HTMLImageElement | null {
  const cached = imageCache.get(src)
  if (cached) return cached.status === 'ready' ? cached.img : null

  const entry: CacheEntry = { img: new Image(), status: 'loading' }
  entry.img.onload = () => {
    entry.status = 'ready'
  }
  entry.img.onerror = () => {
    entry.status = 'error'
  }
  entry.img.src = src
  imageCache.set(src, entry)
  return null
}

function initialFor(name?: string) {
  const letter = name?.trim().charAt(0)
  return letter ? letter.toUpperCase() : '?'
}

export function isNearLiveTip(x: number, liveX: number) {
  return liveX - x < LIVE_TIP_CLEARANCE
}

export function drawAvatars(ctx: CanvasRenderingContext2D, avatars: DrawnAvatar[], globalAlpha = 1) {
  if (avatars.length === 0 || globalAlpha < 0.01) return

  for (const avatar of avatars) {
    if (avatar.appear < 0.01) continue

    const appear = avatar.appear
    const scale = 0.92 + 0.08 * appear
    const alpha = globalAlpha * appear
    const img = getAvatarImage(avatar.avatar)

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(avatar.x, avatar.y)
    ctx.scale(scale, scale)

    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 1

    ctx.beginPath()
    ctx.arc(0, 0, AVATAR_RADIUS + AVATAR_RING, 0, Math.PI * 2)
    ctx.fillStyle = avatar.color
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    ctx.beginPath()
    ctx.arc(0, 0, AVATAR_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()

    ctx.save()
    ctx.beginPath()
    ctx.arc(0, 0, AVATAR_RADIUS - 0.5, 0, Math.PI * 2)
    ctx.clip()

    if (img) {
      ctx.drawImage(img, -AVATAR_RADIUS, -AVATAR_RADIUS, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2)
    } else {
      ctx.fillStyle = '#2a2a2a'
      ctx.fillRect(-AVATAR_RADIUS, -AVATAR_RADIUS, AVATAR_RADIUS * 2, AVATAR_RADIUS * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(initialFor(avatar.name), 0, 0.5)
    }
    ctx.restore()

    ctx.beginPath()
    ctx.arc(0, 0, AVATAR_RADIUS + AVATAR_RING * 0.5, 0, Math.PI * 2)
    ctx.strokeStyle = avatar.color
    ctx.lineWidth = AVATAR_RING
    ctx.stroke()

    ctx.restore()
  }
}
