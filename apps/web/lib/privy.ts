import { AuthorizationContext, PrivyClient } from '@privy-io/node'
import { env } from '@/env'

const privy = new PrivyClient({
  appId: env.NEXT_PUBLIC_PRIVY_APP_ID,
  appSecret: env.PRIVY_APP_SECRET,
})

export const authorizationContext: AuthorizationContext = {
  authorization_private_keys: [env.AUTHORIZATION_PRIVATE_KEY!],
}

export default privy
