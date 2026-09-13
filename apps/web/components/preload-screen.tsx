'use client'

import { useReducedMotion } from 'motion/react'
import Image from 'next/image'
import Marquee from 'react-fast-marquee'

const ROW_COUNT = 20
const MARK_COUNT = 20

function MascotMark() {
  return (
    <Image
      src="/mascot.png"
      alt=""
      width={256}
      height={256}
      priority
      className="h-auto w-full select-none"
      aria-hidden
    />
  )
}

function Wordmark() {
  return (
    <span className="block whitespace-nowrap px-[1.2vw] font-abc-gravity-italic text-[8vw] leading-none text-[#232428] select-none">
      ROGS
    </span>
  )
}

export function PreloadScreen({ status }: { status: string }) {
  const reduceMotion = useReducedMotion() ?? false

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      <figure className="absolute top-1/2 left-1/2 z-10 flex w-[300px] -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <MascotMark />
        <figcaption className="mt-6 whitespace-nowrap text-center font-sans text-sm tracking-[0.18em] text-[#E1E5E6]/65">
          {status}
        </figcaption>
      </figure>

      <section className="absolute z-0 h-full w-full space-y-4 overflow-hidden py-4" aria-hidden>
        {Array.from({ length: ROW_COUNT }).map((_, rowIndex) => (
          <div key={rowIndex}>
            <Marquee direction={rowIndex % 2 === 0 ? 'left' : 'right'} play={!reduceMotion}>
              {Array.from({ length: MARK_COUNT }).map((_, index) => (
                <figure key={index} className="h-auto">
                  <Wordmark />
                </figure>
              ))}
            </Marquee>
          </div>
        ))}
      </section>
    </div>
  )
}
