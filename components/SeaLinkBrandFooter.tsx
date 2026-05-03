import Image from "next/image";
import Link from "next/link";

type Props = { className?: string };

/** Brand artwork at the bottom of key pages, plus legal / help links. */
export function SeaLinkBrandFooter({ className = "" }: Props) {
  return (
    <div className={`mt-10 flex w-full flex-col items-center ${className}`.trim()}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-lg">
        <Image
          src="/sealink-brand-hero.png"
          alt="SeaLink — sailing catamaran"
          width={1024}
          height={1024}
          className="h-auto w-full object-cover"
          sizes="(max-width: 768px) 100vw, 28rem"
        />
      </div>
      <nav
        className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-medium text-zinc-500"
        aria-label="Legal and help"
      >
        <Link href="/terms" className="text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
          T&amp;C
        </Link>
        <Link href="/privacy" className="text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
          Privacy
        </Link>
        <Link href="/help" className="text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
          Help
        </Link>
      </nav>
    </div>
  );
}
