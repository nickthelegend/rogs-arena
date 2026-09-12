import { createEnv } from '@t3-oss/env-core'
import * as z from 'zod'

export const env = createEnv({
  server: {
    FIREBASE_API_KEY: z.string().min(1),
    FIREBASE_AUTH_DOMAIN: z.string().min(1),
    FIREBASE_DATABASE_URL: z.url(),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_STORAGE_BUCKET: z.string().min(1),
    FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
    FIREBASE_APP_ID: z.string().min(1),
    FIREBASE_MEASUREMENT_ID: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
