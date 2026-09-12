import db from '@/db'
import type { CreateUserInput, User } from '@/db/schema'
import { user } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export class UserAlreadyExistsError extends Error {
  constructor(public readonly privyId: string) {
    super(`User with privyId ${privyId} already exists`)
    this.name = 'UserAlreadyExistsError'
  }
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const [existingUser] = await db.select().from(user).where(eq(user.privyId, input.privyId)).limit(1)

  if (existingUser) {
    return existingUser as User
  }

  const id = randomUUID()

  const [newUser] = await db
    .insert(user)
    .values({
      id,
      privyId: input.privyId,
      discordId: input.discordId,
      walletId: input.walletId,
    })
    .returning()

  if (!newUser) {
    throw new Error('Failed to create user')
  }

  return newUser as User
}
