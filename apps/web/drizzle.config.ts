import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
import { env } from './env'

function drizzleKitDatabaseUrl() {
  // Schema introspection uses session-level statements. Supabase's
  // transaction pooler on port 6543 cannot run those, so rewrite to
  // the session pooler on 5432 for drizzle-kit only.
  return env.DATABASE_URL.replace(/:6543\b/, ':5432')
}

export default defineConfig({
  out: './drizzle',
  schema: './db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: drizzleKitDatabaseUrl(),
  },
})

