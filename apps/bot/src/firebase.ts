import { env } from '@/env'
import { deleteApp, initializeApp } from 'firebase/app'
import { getDatabase, goOffline, ref } from 'firebase/database'

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
export const chatRef = ref(database, 'chat')
export const tradersRef = ref(database, 'traders')
export const closesRef = ref(database, 'closes')

export async function closeFirebase() {
  goOffline(database)
  await deleteApp(app)
}
