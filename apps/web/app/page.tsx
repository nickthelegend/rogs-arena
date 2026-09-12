import { AbilityProvider } from '@/components/ability-provider'
import SectionAbility from '@/components/section-ability'
import SectionChartBtc from '@/features/chart-btc'
import SectionChat from '@/components/section-chat'
import SectionHeader from '@/components/section-header'
import SectionHistory from '@/components/section-history'
import SectionLeaderboard from '@/features/leaderboard'
import SectionChartMarket from '@/features/chart-market'
import SectionProgress from '@/features/progress'
import SectionStatus from '@/features/status'
import SectionAbout from '@/features/about'
import SectionDynamicIsland from '@/features/dynamic-island'

export default function Page() {
  return (
    <AbilityProvider>
      <main className="w-screen h-screen bg-background relative p-2 flex flex-col gap-2">
        <SectionHeader />
        <div className="grid min-h-0 w-full flex-1 grid-cols-[400px_1fr_400px] gap-2">
          <div id="left" className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <SectionChat />
            <SectionProgress />
            <SectionStatus />
          </div>

          <div id="center" className="flex flex-col gap-2">
            <SectionChartBtc />
            <SectionChartMarket />
            <SectionDynamicIsland />
          </div>

          <div id="right" className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <SectionLeaderboard />
            <SectionAbility />
            <SectionHistory />
            <SectionAbout />
          </div>
        </div>
      </main>
    </AbilityProvider>
  )
}
