// components/mob/ManOverboardButton.tsx
"use client";

import { useRouter } from "next/navigation";

export default function ManOverboardButton() {
  const router = useRouter();

  const handleClick = () => {
    const until = Date.now() + 10 * 60 * 1000; // active for 10 minutes
    window.localStorage.setItem("sealink_mob_sender_active_until", String(until));
    router.push("/mob");
  };

  return (
    <button
      className="mt-5 flex h-[56px] w-full max-w-xs items-center justify-center rounded-2xl bg-red-500 text-base font-bold text-white shadow-lg"
      onClick={handleClick}
    >
      🛟 MAN OVERBOARD
    </button>
  );
}
