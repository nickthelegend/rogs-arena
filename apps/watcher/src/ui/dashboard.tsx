import { targetMarketLabel, type IntervalOption } from '@/config'
import { publishMarket } from '@/load/publish'
import type { DashboardFill, DashboardMarket, WatcherSnapshot } from '@/types'
import { startWatcher } from '@/watch/runner'
import { Box, Spacer, Text, useApp, useInput, useStdin, useWindowSize } from 'ink'
import { useEffect, useState } from 'react'
import {
  cream,
  formatClock,
  formatMarketTiming,
  formatNumber,
  formatPercent,
  formatRemaining,
  formatRetry,
  formatSide,
  formatSource,
  marketStatusColor,
  marketStatusLabel,
  muted,
  noColor,
  phaseColor,
  phaseLabel,
  sideColor,
  yesColor,
} from './format'

function useNow(intervalMs = 1_000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return now
}

function useWatcher(interval: IntervalOption) {
  const [snapshot, setSnapshot] = useState<WatcherSnapshot>({
    phase: 'connecting',
    message: 'Connecting to DreamDex',
    fillCount: 0,
    fills: [],
    trades: [],
    markets: [],
  })
  const [syncError, setSyncError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    void startWatcher(
      (next) => {
        setSnapshot(next)
        void publishMarket(next).then(
          () => setSyncError(undefined),
          (error) => setSyncError(error instanceof Error ? error.message : 'Sync failed'),
        )
      },
      controller.signal,
      interval,
    )
    return () => controller.abort()
  }, [interval])

  return { snapshot, syncError }
}

function ProbabilityBar({ yes, width }: { yes: number; width: number }) {
  const filled = Math.round(Math.max(0, Math.min(1, yes)) * width)
  return (
    <Box>
      <Text color={yesColor}>{'█'.repeat(filled)}</Text>
      <Text color={noColor}>{'░'.repeat(Math.max(0, width - filled))}</Text>
    </Box>
  )
}

function Header({ snapshot, now, interval }: { snapshot: WatcherSnapshot; now: number; interval: IntervalOption }) {
  const remaining = formatRemaining(snapshot.expirySeconds, now)
  const fetching = snapshot.marketSymbol

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color={cream}>
          RIZZ
        </Text>
        <Text dimColor> watcher</Text>
        <Spacer />
        <Text color={muted}>{targetMarketLabel(interval)}</Text>
      </Box>
      <Box>
        <Text color={cream} wrap="truncate">
          {fetching ? `fetching ${fetching}` : 'No market selected'}
        </Text>
        <Spacer />
        <Text color={phaseColor(snapshot.phase)} bold>
          ● {phaseLabel(snapshot.phase)}
        </Text>
        {remaining ? (
          <Text color={muted}>
            {'  '}
            {remaining}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}

function MarketRow({
  market,
  fetching,
  source,
  now,
}: {
  market: DashboardMarket
  fetching: boolean
  source?: WatcherSnapshot['source']
  now: number
}) {
  return (
    <Box>
      <Box width={2}>
        <Text color={fetching ? cream : muted}>{fetching ? '›' : ' '}</Text>
      </Box>
      <Box width={28}>
        <Text color={fetching ? cream : undefined} bold={fetching} wrap="truncate">
          {market.symbol}
        </Text>
      </Box>
      <Box width={8}>
        <Text color={marketStatusColor(market.status)} bold={market.status === 'live'}>
          {marketStatusLabel(market.status)}
        </Text>
      </Box>
      <Box width={14}>
        <Text color={muted}>{formatMarketTiming(market, now)}</Text>
      </Box>
      <Box>
        <Text color={fetching ? cream : muted}>{fetching ? `fetching · ${formatSource(source)}` : ''}</Text>
      </Box>
    </Box>
  )
}

function MarketRoster({
  markets,
  fetchingId,
  source,
  now,
  interval,
}: {
  markets: DashboardMarket[]
  fetchingId?: string
  source?: WatcherSnapshot['source']
  now: number
  interval: IntervalOption
}) {
  const liveCount = markets.filter((market) => market.status === 'live').length
  const nextCount = markets.filter((market) => market.status === 'upcoming').length

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={muted} bold>
          MARKETS
        </Text>
        <Spacer />
        <Text color={muted}>
          {liveCount} live · {nextCount} next
        </Text>
      </Box>
      {markets.length === 0 ? (
        <Text color={muted}>Waiting for {targetMarketLabel(interval)} markets…</Text>
      ) : (
        <>
          <Box>
            <Box width={2} />
            <Box width={28}>
              <Text color={muted} bold>
                MARKET
              </Text>
            </Box>
            <Box width={8}>
              <Text color={muted} bold>
                STATE
              </Text>
            </Box>
            <Box width={14}>
              <Text color={muted} bold>
                TIME
              </Text>
            </Box>
            <Box>
              <Text color={muted} bold>
                DATA
              </Text>
            </Box>
          </Box>
          {markets.map((market) => (
            <MarketRow
              key={market.id}
              market={market}
              fetching={Boolean(fetchingId) && market.id === fetchingId}
              source={source}
              now={now}
            />
          ))}
        </>
      )}
    </Box>
  )
}

function OutcomeCard({ label, value, color }: { label: string; value: number | undefined; color: string }) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} borderStyle="round" borderColor={color}>
      <Text color={color} bold>
        {label}
      </Text>
      <Text color={color} bold>
        {formatPercent(value)}
      </Text>
    </Box>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box marginRight={3}>
      <Text color={muted}>{label} </Text>
      <Text color={cream}>{value}</Text>
    </Box>
  )
}

function FillRow({ fill }: { fill: DashboardFill }) {
  return (
    <Box>
      <Box width={10}>
        <Text color={muted}>{formatClock(fill.timestamp)}</Text>
      </Box>
      <Box width={12}>
        <Text color={sideColor(fill.side)}>{formatSide(fill.side)}</Text>
      </Box>
      <Box width={10}>
        <Text color={cream}>{formatPercent(fill.price)}</Text>
      </Box>
      <Box width={10} justifyContent="flex-end">
        <Text>{formatNumber(fill.amount)}</Text>
      </Box>
      <Box width={10} justifyContent="flex-end">
        <Text color={muted}>{formatNumber(fill.cost)}</Text>
      </Box>
    </Box>
  )
}

function Fills({ fills }: { fills: DashboardFill[] }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Box width={10}>
          <Text color={muted} bold>
            TIME
          </Text>
        </Box>
        <Box width={12}>
          <Text color={muted} bold>
            SIDE
          </Text>
        </Box>
        <Box width={10}>
          <Text color={muted} bold>
            YES
          </Text>
        </Box>
        <Box width={10} justifyContent="flex-end">
          <Text color={muted} bold>
            SIZE
          </Text>
        </Box>
        <Box width={10} justifyContent="flex-end">
          <Text color={muted} bold>
            COST
          </Text>
        </Box>
      </Box>
      {fills.length === 0 ? (
        <Text color={muted}>Waiting for fills…</Text>
      ) : (
        fills.map((fill) => <FillRow key={fill.id} fill={fill} />)
      )}
    </Box>
  )
}

function StatusPanel({ snapshot, now }: { snapshot: WatcherSnapshot; now: number }) {
  const retry = formatRetry(snapshot.retryAt, now)

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={cream}>{snapshot.message ?? 'Working'}</Text>
      {retry ? <Text color={muted}>{retry}</Text> : null}
    </Box>
  )
}

export function DashboardView({
  snapshot,
  syncError,
  interval,
}: {
  snapshot: WatcherSnapshot
  syncError?: string
  interval: IntervalOption
}) {
  const now = useNow()
  const { columns } = useWindowSize()
  const barWidth = Math.max(16, Math.min(48, columns - 8))
  const showMarket = snapshot.phase === 'watching' && snapshot.yes !== undefined

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} borderStyle="round" borderColor={cream}>
      <Header snapshot={snapshot} now={now} interval={interval} />
      <MarketRoster
        markets={snapshot.markets ?? []}
        fetchingId={snapshot.marketId}
        source={snapshot.source}
        now={now}
        interval={interval}
      />

      {showMarket ? (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Box gap={1}>
            <OutcomeCard label="YES" value={snapshot.yes} color={yesColor} />
            <OutcomeCard label="NO" value={snapshot.no} color={noColor} />
          </Box>

          <ProbabilityBar yes={snapshot.yes ?? 0.5} width={barWidth} />

          <Box>
            <Stat label="source" value={formatSource(snapshot.source)} />
            <Stat label="fills" value={String(snapshot.fillCount)} />
            <Stat label="book" value={formatPercent(snapshot.bookYes)} />
            <Stat label="last fill" value={formatPercent(snapshot.lastFillYes)} />
          </Box>

          <Fills fills={snapshot.fills} />
        </Box>
      ) : (
        <StatusPanel snapshot={snapshot} now={now} />
      )}

      <Box marginTop={1}>
        <Text color={muted}>
          q quit · {snapshot.marketSymbol ? `data from ${snapshot.marketSymbol}` : 'auto-switches on expiry'} ·{' '}
        </Text>
        <SyncStatus error={syncError} />
      </Box>
    </Box>
  )
}

function QuitOnQ() {
  const { exit } = useApp()

  useInput((input) => {
    if (input === 'q') exit()
  })

  return null
}

function SyncStatus({ error }: { error?: string }) {
  if (error) {
    return <Text color={noColor}>rtb {error}</Text>
  }

  return <Text color={muted}>rtb market · trades</Text>
}

export function Dashboard({ interval }: { interval: IntervalOption }) {
  const { isRawModeSupported } = useStdin()
  const { snapshot, syncError } = useWatcher(interval)

  return (
    <>
      {isRawModeSupported ? <QuitOnQ /> : null}
      <DashboardView snapshot={snapshot} syncError={syncError} interval={interval} />
    </>
  )
}
