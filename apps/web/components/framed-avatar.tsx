import Image from 'next/image'

export function FramedAvatar({
  src,
  frame,
  alt,
  className,
}: {
  src: string
  frame: string
  alt: string
  className: string
}) {
  return (
    <figure
      className={`shrink-0 rounded-lg bg-cover bg-center p-[2px] ${className}`}
      style={{ backgroundImage: `url(${frame})` }}
    >
      <Image
        draggable={false}
        src={src}
        alt={alt}
        width={60}
        height={60}
        className="h-full w-full rounded-[6px] object-cover"
      />
    </figure>
  )
}
