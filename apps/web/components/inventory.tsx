import Image from 'next/image'

export default function Inventory() {
  return (
    <aside className="bg-[#673818] w-[700px] h-full z-1 mask-[url('/masks/panel-inventory.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-4">
      <div className="bg-[#ECAD70] w-full h-full z-2 mask-[url('/masks/panel-inventory.png')] mask-size-[100%_100%] mask-no-repeat mask-center pr-4 pt-2">
        <div className="bg-[#ECD19C] w-full h-full z-2 mask-[url('/masks/panel-inventory.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-5 grid grid-cols-4 grid-rows-2">
          <div className="w-full h-full flex items-center justify-center relative cursor-pointer">
            <figure className="w-[120px] h-[120px]">
              <Image
                src="/fishes/fish-01.png"
                alt="Fish 1"
                width={100}
                height={100}
                className="w-full h-full object-contain"
              />
            </figure>
            <div className="absolute bottom-10 right-5 bg-[#90B64F] mask-[url('/masks/circle.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-2 text-xl font-faylake text-[#3C1F11] leading-none">
              x5
            </div>
          </div>
          <div className="w-full h-full flex items-center justify-center relative cursor-pointer">
            <figure className="w-[120px] h-[120px]">
              <Image
                src="/fishes/fish-02.png"
                alt="Fish 1"
                width={100}
                height={100}
                className="w-full h-full object-contain"
              />
            </figure>
            <div className="absolute bottom-10 right-5 bg-[#90B64F] mask-[url('/masks/circle.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-2 text-xl font-faylake text-[#3C1F11] leading-none">
              x5
            </div>
          </div>
          <div className="w-full h-full flex items-center justify-center relative cursor-pointer">
            <figure className="w-[120px] h-[120px]">
              <Image
                src="/fishes/fish-03.png"
                alt="Fish 1"
                width={100}
                height={100}
                className="w-full h-full object-contain"
              />
            </figure>
            <div className="absolute bottom-10 right-5 bg-[#90B64F] mask-[url('/masks/circle.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-2 text-xl font-faylake text-[#3C1F11] leading-none">
              x5
            </div>
          </div>
          <div className="w-full h-full flex items-center justify-center relative cursor-pointer">
            <figure className="w-[120px] h-[120px]">
              <Image
                src="/fishes/fish-04.png"
                alt="Fish 1"
                width={100}
                height={100}
                className="w-full h-full object-contain"
              />
            </figure>
            <div className="absolute bottom-10 right-5 bg-[#90B64F] mask-[url('/masks/circle.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-2 text-xl font-faylake text-[#3C1F11] leading-none">
              x5
            </div>
          </div>

          <div className="w-full h-full flex items-center justify-center relative cursor-pointer">
            <figure className="w-[120px] h-[120px]">
              <Image
                src="/rods/rod-01.png"
                alt="Rod 1"
                width={100}
                height={100}
                className="w-full h-full object-contain"
              />
            </figure>
            <div className="absolute bottom-10 right-5 bg-[#389591] mask-[url('/masks/circle.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-2 text-xl font-faylake text-white leading-none">
              x5
            </div>
          </div>
          <div className="w-full h-full flex items-center justify-center relative cursor-pointer">
            <figure className="w-[120px] h-[120px]">
              <Image
                src="/rods/rod-02.png"
                alt="Fish 1"
                width={100}
                height={100}
                className="w-full h-full object-contain"
              />
            </figure>
            <div className="absolute bottom-10 right-5 bg-[#389591] mask-[url('/masks/circle.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-2 text-xl font-faylake text-white leading-none">
              x5
            </div>
          </div>
          <div className="w-full h-full flex items-center justify-center relative cursor-pointer">
            <figure className="w-[120px] h-[120px]">
              <Image
                src="/rods/rod-03.png"
                alt="Rod 1"
                width={100}
                height={100}
                className="w-full h-full object-contain"
              />
            </figure>
            <div className="absolute bottom-10 right-5 bg-[#389591] mask-[url('/masks/circle.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-2 text-xl font-faylake text-white leading-none">
              x5
            </div>
          </div>
          <div className="w-full h-full flex items-center justify-center relative cursor-pointer">
            <figure className="w-[120px] h-[120px]">
              <Image
                src="/rods/rod-04.png"
                alt="Rod 1"
                width={100}
                height={100}
                className="w-full h-full object-contain"
              />
            </figure>
            <div className="absolute bottom-10 right-5 bg-[#389591] mask-[url('/masks/circle.png')] mask-size-[100%_100%] mask-no-repeat mask-center p-2 text-xl font-faylake text-white leading-none">
              x5
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
