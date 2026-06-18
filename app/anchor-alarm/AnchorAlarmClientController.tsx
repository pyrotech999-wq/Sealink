'use client';

import { useEffect, useState } from 'react';
import { useIsMobileApp } from '@/hooks/useIsMobileApp';
import { AnchorAlarmMobileUI } from './AnchorAlarmClientController.mobile';
import { AnchorAlarmWebUI } from './AnchorAlarmClientController.web';

interface Props {
  signedIn: boolean;
  isAdmin: boolean;
}

export default function AnchorAlarmClientController({ signedIn, isAdmin }: Props) {
  const { isMobile, mounted } = useIsMobileApp();

  // Safeguard hydration matching your exact architectural pattern
  if (!mounted) {
    return (
      <div className="flex flex-1 flex-col bg-black min-h-screen">
        <div className="p-4 text-center text-zinc-500">Loading profile...</div>
      </div>
    );
  }

  // 📱 MOBILE APP / MOBILE BROWSER VIEW
  if (isMobile) {
    return <AnchorAlarmMobileUI signedIn={signedIn} isAdmin={isAdmin} />;
  }

  // 💻 WEB BROWSER / DESKTOP DESIGN
  return <AnchorAlarmWebUI signedIn={signedIn} isAdmin={isAdmin} />;
}