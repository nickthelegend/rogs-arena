'use client'

import { useArenaChain } from '@/components/arena-chain-provider'
import { env } from '@/env'
import { getCheers, getHealth, getRounds, type CheersDto, type RoundDto } from '@/lib/arena-api'
import { errorMessage } from '@/lib/error'
import {
  arenaPda,
  decodeArena,
  explorerTxUrl,
  fetchArena,
  fetchOraclePrice,
  getDelegationStatus,
  type ArenaState,
  type DelegationStatus,
} from '@rogs/arena-sdk'
import { useEffect, useState } from 'react'

const REFRESH_MS = 5_000

type Proof = {
  checkedAt: number
  router: DelegationStatus
  er: ArenaState
  base: { owner: string; state: ArenaState | null }
  oracle: { price: number; publishTime: number }
  rounds: RoundDto[]
  cheers: CheersDto | null
  health: Awaited<ReturnType<typeof getHealth>> | null
}

const addressUrl = (address: string) => `https://explorer.solana.com/address/${address}?cluster=devnet`
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-6)}`
const usd = (chips: bigint) => `$${(Number(chips) / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const time = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString()

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#E130FC] underline-offset-2 hover:underline">
      {children}
    </a>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/5 py-2 last:border-0">
      <span className="text-white/50">{label}</span>
      <span className="text-right text-white/90 tabular-nums">{children}</span>
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="section-panel flex flex-col gap-1 rounded-2xl bg-[#1a1a1a] p-5">
      <h2 className="font-abc-gravity-italic text-2xl text-white">{title}</h2>
      <p className="mb-2 text-sm text-white/50">{subtitle}</p>
      {children}
    </section>
  )
}

export default function ProofPage() {
  const { connections, programId, oracleFeed } = useArenaChain()
  const [proof, setProof] = useState<Proof | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    let active = true
    const arena = arenaPda(programId)

    async function load() {
      try {
        const [router, er, baseAccount, oracle, rounds, cheers, health] = await Promise.all([
          getDelegationStatus(env.NEXT_PUBLIC_ROUTER_URL, arena),
          fetchArena(connections.er, programId),
          connections.base.getAccountInfo(arena, 'confirmed'),
          fetchOraclePrice(connections.er, oracleFeed),
          getRounds(3),
          getCheers(1),
          getHealth().catch(() => null),
        ])
        if (!active) return
        setProof({
          checkedAt: Date.now(),
          router,
          er,
          base: {
            owner: baseAccount?.owner.toBase58() ?? 'missing',
            state: baseAccount ? decodeArena(arena, baseAccount.data) : null,
          },
          oracle: { price: oracle.price, publishTime: oracle.publishTime },
          rounds,
          cheers: cheers[0] ?? null,
          health,
        })
        setError(null)
      } catch (cause) {
        if (active) setError(errorMessage(cause))
      }
    }

    void load()
    const refresh = window.setInterval(load, REFRESH_MS)
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000)
    return () => {
      active = false
      window.clearInterval(refresh)
      window.clearInterval(tick)
    }
  }, [connections, oracleFeed, programId])

  const arena = arenaPda(programId).toBase58()
  const lastResolved = proof?.rounds.find((round) => round.outcome)
  const openRound = proof?.rounds.find((round) => round.roundId === proof.er.current.id)

  return (
    <main className="min-h-screen w-full bg-background p-4 font-sans text-sm text-white md:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="flex flex-col gap-2">
          <a href="/" className="text-white/50 hover:text-white">← Back to the arena</a>
          <h1 className="font-abc-gravity-italic text-4xl">Proof it runs on MagicBlock</h1>
          <p className="max-w-3xl text-white/60">
            Every value below is read live from Solana devnet, the MagicBlock Ephemeral Rollup, the Magic Router and the
            arena indexer. It refreshes every {REFRESH_MS / 1000} seconds. Links open the transactions and accounts.
          </p>
          {error && <p className="text-[#F87171]">Could not refresh: {error}</p>}
          {proof && <p className="text-white/40">Last checked {new Date(proof.checkedAt).toLocaleTimeString()}</p>}
        </header>

        {!proof ? (
          <p className="text-white/60">{error ? 'Retrying…' : 'Reading the chain…'}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Ephemeral Rollup delegation" subtitle="The Arena account is delegated to a MagicBlock validator.">
              <Row label="Program"><Link href={addressUrl(programId.toBase58())}>{short(programId.toBase58())}</Link></Row>
              <Row label="Arena account"><Link href={addressUrl(arena)}>{short(arena)}</Link></Row>
              <Row label="Router: delegated">{proof.router.isDelegated ? 'yes' : 'no'}</Row>
              <Row label="Router: rollup">{proof.router.fqdn ?? '—'}</Row>
              <Row label="Validator">{proof.router.delegationRecord ? short(proof.router.delegationRecord.authority) : '—'}</Row>
              <Row label="Owner on Solana"><Link href={addressUrl(proof.base.owner)}>{short(proof.base.owner)}</Link></Row>
            </Card>

            <Card title="Crank rolls rounds" subtitle="A MagicBlock scheduled task calls roll_round every 2 s inside the rollup.">
              <Row label="Crank task id">{proof.er.crankTaskId.toString()}</Row>
              <Row label="Open round">#{proof.er.current.id}, ends {time(proof.er.current.endTs)} ({Math.max(0, proof.er.current.endTs - now)}s)</Row>
              <Row label="Last roll">{time(proof.er.lastRollTs)} ({now - proof.er.lastRollTs}s ago)</Row>
              {openRound?.openedSig && (
                <Row label="Round opened in"><Link href={explorerTxUrl(openRound.openedSig, 'er')}>{short(openRound.openedSig)}</Link></Row>
              )}
              {lastResolved && (
                <Row label={`Round #${lastResolved.roundId} resolved`}>
                  {lastResolved.outcome}
                  {lastResolved.resolvedSig && <> · <Link href={explorerTxUrl(lastResolved.resolvedSig, 'er')}>{short(lastResolved.resolvedSig)}</Link></>}
                </Row>
              )}
            </Card>

            <Card title="Pricing oracle" subtitle="Strike and close come from the BTC/USD price feed read inside the rollup.">
              <Row label="Feed"><Link href={addressUrl(oracleFeed.toBase58())}>{short(oracleFeed.toBase58())}</Link></Row>
              <Row label="BTC/USD">${proof.oracle.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Row>
              <Row label="Published">{time(proof.oracle.publishTime)} ({Math.max(0, now - proof.oracle.publishTime)}s ago)</Row>
              <Row label="Open round strike">${(Number(proof.er.current.strikePrice) / 1e8).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Row>
            </Card>

            <Card title="Verifiable randomness" subtitle="Cheers winners are picked by MagicBlock VRF in a callback transaction.">
              {proof.cheers ? (
                <>
                  <Row label="Callback"><Link href={explorerTxUrl(proof.cheers.sig, 'er')}>{short(proof.cheers.sig)}</Link></Row>
                  <Row label="Randomness">{short(proof.cheers.randomness)}</Row>
                  <Row label="Recipients">{proof.cheers.recipients.map(short).join(', ')}</Row>
                  <Row label="Paid each">${proof.cheers.amountEach.toFixed(2)}</Row>
                </>
              ) : (
                <p className="text-white/60">No Cheers has been paid yet.</p>
              )}
            </Card>

            <Card title="Commits to Solana" subtitle="The rollup state is committed back to Solana; the account stays delegated.">
              <Row label="Commits (rollup counter)">{proof.er.commits}</Row>
              <Row label="Solana snapshot: round">{proof.base.state ? `#${proof.base.state.current.id}` : '—'}</Row>
              <Row label="Solana snapshot: trades">{proof.base.state?.totalTrades ?? '—'}</Row>
              <Row label="Rollup now: trades">{proof.er.totalTrades}</Row>
            </Card>

            <Card title="Arena economy" subtitle="Chips are devnet play money held by the program.">
              <Row label="Players">{proof.er.totalPlayers}</Row>
              <Row label="Trades">{proof.er.totalTrades}</Row>
              <Row label="Volume">{usd(proof.er.totalVolume)}</Row>
              <Row label="Treasury">{usd(proof.er.treasury)}</Row>
              <Row label="Indexer">{proof.health ? (proof.health.ok ? 'live' : 'degraded') : 'unreachable'}</Row>
            </Card>
          </div>
        )}
      </div>
    </main>
  )
}
