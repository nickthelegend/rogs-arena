'use client'

import { useArenaWallet } from '@/components/arena-wallet-provider'

export default function CtaBtnGroup() {
  const { connect, connecting } = useArenaWallet()

  return (
    <div className="absolute bottom-[60px] flex gap-2">
      {!connecting && (
        <button onClick={connect} className="cursor-pointer active:scale-85 transition-all duration-100 h-[80px]">
          <span className="text-2xl font-faylake">Connect wallet</span>
        </button>
      )}
    </div>
  )
}
