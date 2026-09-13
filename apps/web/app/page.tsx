import { AbilityProvider } from '@/components/ability-provider'
import SectionAbility from '@/components/section-ability'
import SectionChartPrice from '@/features/chart-price'
import SectionChat from '@/components/section-chat'
import SectionHeader from '@/components/section-header'
import SectionHistory from '@/components/section-history'
import SectionLeaderboard from '@/features/leaderboard'
import SectionChartMarket from '@/features/chart-market'
import SectionProgress from '@/features/progress'
import SectionStatus from '@/features/status'
import SectionAbout from '@/features/about'
import SectionDynamicIsland from '@/features/dynamic-island'
import { ViewportFit } from '@/components/viewport-fit'

export default function Page() {
  return (
    <AbilityProvider>
      <ViewportFit>
      {/*
        Below md the three columns dissolve (display: contents) into one scrolling column of the same sections:
        the center column first (charts, island), then the right column, then the left one, with About last.
      */}
      <main className="w-screen h-screen bg-background relative p-2 flex flex-col gap-2 max-md:h-auto max-md:w-full">
        <SectionHeader />
        <div className="grid min-h-0 w-full flex-1 grid-cols-[400px_1fr_400px] gap-2 max-md:flex max-md:flex-col">
          <div id="left" className="flex min-h-0 flex-col gap-2 overflow-hidden max-md:contents max-md:*:order-3">
            <SectionChat />
            <SectionProgress />
            <SectionStatus />
          </div>

          <div id="center" className="flex flex-col gap-2 max-md:contents max-md:*:order-1">
            <SectionChartPrice />
            <SectionChartMarket />
            <SectionDynamicIsland />
          </div>

          <div
            id="right"
            className="flex min-h-0 flex-col gap-2 overflow-hidden max-md:contents max-md:*:order-2 max-md:*:last:order-4"
          >
            <SectionLeaderboard />
            <SectionAbility />
            <SectionHistory />
            <SectionAbout />
          </div>
        </div>
      </main>
      </ViewportFit>
    </AbilityProvider>
  )
}
