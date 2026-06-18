'use client';

import { useIsMobileApp } from '@/hooks/useIsMobileApp';
import MobileMessages from './MobileMessages';

interface Props {
  children: React.ReactNode;
  signedIn: boolean;
  canSendGlobalBroadcast: boolean;
}

export default function MessagesSwitcher({
  children,
  signedIn,
  canSendGlobalBroadcast,
}: Props) {
  const { isMobile, mounted } = useIsMobileApp();

  if (!mounted) {
    return <>{children}</>;
  }

  return isMobile ? (
    <MobileMessages
      signedIn={signedIn}
      canSendGlobalBroadcast={canSendGlobalBroadcast}
    />
  ) : (
    <>{children}</>
  );
}