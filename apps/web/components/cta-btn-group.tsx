'use client'

import { env } from '@/env'
import { useLogin, useSigners } from '@privy-io/react-auth'
import { useState } from 'react'

export default function CtaBtnGroup() {
  const { addSigners } = useSigners()
  const { login } = useLogin({
    onComplete: async (params) => {
      if (!params.user.wallet?.address) {
        return
      }

      await addSigners({
        address: params.user.wallet.address,
        signers: [{ signerId: env.NEXT_PUBLIC_AUTHORIZATION_ID }],
      })
    },
  })

  const [isRegistering, setIsRegistering] = useState(false)

  const handleRegister = async () => {
    try {
      setIsRegistering(true)

      // Step 1: Login with Discord
      const response = login({
        loginMethods: ['google', 'email', 'wallet'],
      })

      console.log(response)
    } catch (error) {
      console.error(error)
    } finally {
      setIsRegistering(false)
    }
  }

  return (
    <div className="absolute bottom-[60px] flex gap-2">
      {!isRegistering && (
        <button
          onClick={handleRegister}
          className="cursor-pointer active:scale-85 transition-all duration-100 h-[80px]"
        >
          <span className="text-2xl font-faylake">Register</span>
        </button>
      )}
    </div>
  )
}
