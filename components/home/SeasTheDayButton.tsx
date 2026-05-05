"use client";

type Props = {
  className?: string;
};

export function SeasTheDayButton({ className }: Props) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new Event("sealink-seas-the-day-open"));
      }}
      className={
        className ??
        "inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-teal-300 bg-teal-50 px-4 text-sm font-semibold text-teal-900 shadow-sm hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-100 dark:hover:bg-teal-900/70"
      }
    >
      Sea&apos;s the day!
    </button>
  );
}

