'use client';
import Link from 'next/link';
import {
  Anchor,
  CloudSun,
  MessageSquare,
  ChartNoAxesColumn,
  Ship,
} from 'lucide-react';

const actions = [
  {
    title: 'Anchor Alarm',
    icon: Anchor,
    isModal: true,
    colorClass: 'text-amber-400 group-hover:text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]',
    cardGlow: 'hover:shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:border-amber-500/30',
  },
  {
    title: 'Weather',
    href: '/weather',
    icon: CloudSun,
    colorClass: 'text-sky-400 group-hover:text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]',
    cardGlow: 'hover:shadow-[0_0_15px_rgba(14,165,233,0.15)] hover:border-sky-500/30',
  },
  {
    title: 'Marinas',
    href: '/marinas',
    icon: Ship,
    colorClass: 'text-teal-400 group-hover:text-teal-300 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]',
    cardGlow: 'hover:shadow-[0_0_15px_rgba(13,148,136,0.15)] hover:border-teal-500/30',
  },
  {
    title: 'Messages',
    href: '/messaging',
    icon: MessageSquare,
    colorClass: 'text-indigo-400 group-hover:text-indigo-300 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]',
    cardGlow: 'hover:shadow-[0_0_15px_rgba(99,102,241,0.15)] hover:border-indigo-500/30',
  },
  {
    title: 'Charts',
    href: '/navigation-charts',
    icon: ChartNoAxesColumn,
    colorClass: 'text-emerald-400 group-hover:text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]',
    cardGlow: 'hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:border-emerald-500/30',
  },
];

interface Props {
  onAnchorClick: () => void;
}

export default function QuickActions({
  onAnchorClick,
}: Props) {
  return (
    <div className="mt-6">
      <h2 className="mb-3 text-[17px] font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
        <span>⚡</span> Quick Control Center
      </h2>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {actions.map((item) => {
          const Icon = item.icon;

          if (item.isModal) {
            return (
              <button
                key={item.title}
                onClick={onAnchorClick}
                className={`group flex h-[90px] flex-col items-center justify-center rounded-[22px] border border-white/[0.06] bg-gradient-to-b from-[#112139]/50 to-[#071120]/75 backdrop-blur-md transition-all duration-300 ${item.cardGlow}`}
              >
                <Icon
                  size={26}
                  className={`mb-2 transition-transform duration-300 group-hover:scale-110 ${item.colorClass}`}
                />
                <span className="text-center text-[10px] font-bold text-slate-300 group-hover:text-white transition-colors">
                  {item.title}
                </span>
              </button>
            );
          }

          return (
            <Link
              key={item.title}
              href={item.href!}
              className={`group flex h-[90px] flex-col items-center justify-center rounded-[22px] border border-white/[0.06] bg-gradient-to-b from-[#112139]/50 to-[#071120]/75 backdrop-blur-md transition-all duration-300 ${item.cardGlow}`}
            >
              <Icon
                size={26}
                className={`mb-2 transition-transform duration-300 group-hover:scale-110 ${item.colorClass}`}
              />
              <span className="text-center text-[10px] font-bold text-slate-300 group-hover:text-white transition-colors">
                {item.title}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
