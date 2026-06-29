"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import MobileHome from "./MobileHome";

interface HomeSwitcherProps {
  children: React.ReactNode;
  signedIn: boolean;
  welcomeFirstName: string | null;
  isAdmin?: boolean;
}

export default function HomeSwitcher({
  children,
  signedIn,
  welcomeFirstName,
  isAdmin = false,
}: HomeSwitcherProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  const isApp = Capacitor.isNativePlatform();

  return isApp ? (
    <MobileHome
      signedIn={signedIn}
      welcomeFirstName={welcomeFirstName}
      isAdmin={isAdmin}
    />
  ) : (
    <>{children}</>
  );
}
