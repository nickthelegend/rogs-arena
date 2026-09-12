'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateUserInput, User } from '@/db/schema'

async function createUser(input: CreateUserInput & { linkedAddress: string }): Promise<User> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...input, linkedAddress: input.linkedAddress }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create user' }))
    throw new Error(error.error ?? 'Failed to create user')
  }

  return response.json()
}

export const userKeys = {
  all: ['users'] as const,
  create: () => [...userKeys.all, 'create'] as const,
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createUser,
    mutationKey: userKeys.create(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}
