import Image from "next/image";

type Props = { className?: string };

/** Brand artwork at the bottom of key pages. */
export function SeaLinkBrandFooter({ className = "" }: Props) {
  return (
    <div className={`mt-10 flex w-full flex-col items-center ${className}`.trim()}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-lg">
        <Image
          src="/sealink-brand-hero.png"
          alt="SeaLink — ferry on the water"
          width={1024}
          height={1024}
          className="h-auto w-full object-cover"
          sizes="(max-width: 768px) 100vw, 28rem"
        />
      </div>
    </div>
  );
}
