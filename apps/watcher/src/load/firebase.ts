import { initializeApp } from 'firebase/app'
import { getDatabase, ref } from 'firebase/database'
import { etlPath, etlTradesPath } from '@/config'
import { env } from '@/env'

const app = initializeApp({
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  databaseURL: env.FIREBASE_DATABASE_URL,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID,
  measurementId: env.FIREBASE_MEASUREMENT_ID,
})

export const database = getDatabase(app)
export const marketRef = ref(database, etlPath)
export const tradesRef = ref(database, etlTradesPath)
