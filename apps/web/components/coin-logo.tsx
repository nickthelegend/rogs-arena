import Image from 'next/image'
import { cn } from 'cn'

/** Official coin mark from /public/coins (branded web3icons, MIT). Decorative: the ticker text sits next to it. */
export function CoinLogo({ symbol, className }: { symbol: string; className?: string }) {
  return (
    <Image
      src={`/coins/${symbol.toLowerCase()}.svg`}
      alt=""
      aria-hidden
      width={32}
      height={32}
      unoptimized
      // Tiny, above the fold, and part of the price readout: lazy loading left it blank in background tabs.
      loading="eager"
      className={cn('shrink-0 select-none', className)}
    />
  )
}
