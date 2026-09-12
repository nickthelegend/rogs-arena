import { connectDb, type Database } from '../db'
import { env } from '../env'

export const TEST_DB = 'rogs_arena_test'

export type TestDatabase = Database & { drop: () => Promise<void> }

/** A real Mongo database for tests; `drop` removes it and closes the client. */
export async function openTestDb(): Promise<TestDatabase> {
  const database = await connectDb(env.MONGODB_URI, TEST_DB)
  return {
    ...database,
    drop: async () => {
      await database.db.dropDatabase()
      await database.client.close()
    },
  }
}
