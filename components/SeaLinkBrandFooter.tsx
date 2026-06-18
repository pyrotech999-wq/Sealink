import Image from 'next/image';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';

type Props = { className?: string };

export function SeaLinkBrandFooter({ className = '' }: Props) {
  const isMobileApp = Capacitor.isNativePlatform();

  if (isMobileApp) {
    return (
      // <div className={`mt-6 px-4 pb-6 ${className}`.trim()}>
      //   <div
      //     className="
      //     overflow-hidden
      //     rounded-3xl
      //     border
      //     border-white/10
      //     bg-gradient-to-br
      //     from-[#08131f]
      //     via-[#0c1d2f]
      //     to-[#10233b]
      //     shadow-2xl
      //     "
      //   >
      //     <div className="p-6">
      //       <div className="flex items-center gap-3">
      //         <div className="text-3xl">⚓</div>

      //         <div>
      //           <h3 className="text-lg font-bold text-white">SeaLink</h3>

      //           <p className="text-xs text-slate-400">
      //             Connected on every voyage
      //           </p>
      //         </div>
      //       </div>

      //       <p className="mt-4 text-sm leading-relaxed text-slate-300">
      //         Marine tracking, anchor alarms, weather awareness, and vessel
      //         connectivity in one platform.
      //       </p>

      //       <div className="mt-5 flex gap-2">
      //         <Link
      //           href="/terms"
      //           className="
      //           rounded-full
      //           border
      //           border-white/10
      //           px-4
      //           py-2
      //           text-xs
      //           text-slate-300
      //           "
      //         >
      //           Terms
      //         </Link>

      //         <Link
      //           href="/privacy"
      //           className="
      //           rounded-full
      //           border
      //           border-white/10
      //           px-4
      //           py-2
      //           text-xs
      //           text-slate-300
      //           "
      //         >
      //           Privacy
      //         </Link>

      //         <Link
      //           href="/help"
      //           className="
      //           rounded-full
      //           border
      //           border-white/10
      //           px-4
      //           py-2
      //           text-xs
      //           text-slate-300
      //           "
      //         >
      //           Help
      //         </Link>
      //       </div>
      //     </div>
      //   </div>
      // </div>
      <></>
    );
  }

  // Existing website footer unchanged
  return (
    <div
      className={`mt-10 flex w-full flex-col items-center ${className}`.trim()}
    >
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
        <Link
          href="/terms"
          className="text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
        >
          T&C
        </Link>

        <Link
          href="/privacy"
          className="text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
        >
          Privacy
        </Link>

        <Link
          href="/help"
          className="text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
        >
          Help
        </Link>
      </nav>
    </div>
  );
}
