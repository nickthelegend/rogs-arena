import { InferInsertModel, InferSelectModel, relations } from 'drizzle-orm'
import { integer, pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	privyId: text('privy_id').notNull(),
	discordId: text('discord_id').notNull(),
	walletId: text('wallet_id').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull()
})

export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at').notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(table) => [index('session_userId_idx').on(table.userId)]
)

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at'),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [index('account_userId_idx').on(table.userId)]
)

export const verification = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
)

export const abilityPlay = pgTable(
	'ability_play',
	{
		id: text('id').primaryKey(),
		abilityId: integer('ability_id').notNull(),
		kind: text('kind').notNull(),
		address: text('address').notNull(),
		walletId: text('wallet_id').notNull(),
		marketId: text('market_id').notNull(),
		outcome: text('outcome').notNull(),
		stakeAmount: text('stake_amount').notNull(),
		shares: text('shares').notNull(),
		status: text('status').notNull(),
		profit: text('profit'),
		payoutAmount: text('payout_amount'),
		payoutsJson: text('payouts_json'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		settledAt: timestamp('settled_at')
	},
	(table) => [
		index('ability_play_address_market_idx').on(table.address, table.marketId),
		index('ability_play_status_idx').on(table.status)
	]
)

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account)
}))

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}))

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	})
}))

// Inferred types - single source of truth
export type User = InferSelectModel<typeof user>
export type UserInsert = InferInsertModel<typeof user>
// Create input = required fields for insert (exclude id, createdAt, updatedAt)
export type CreateUserInput = Pick<UserInsert, 'privyId' | 'discordId' | 'walletId'>
export type AbilityPlay = InferSelectModel<typeof abilityPlay>
export type AbilityPlayInsert = InferInsertModel<typeof abilityPlay>
