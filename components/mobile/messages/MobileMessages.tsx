'use client';

import MobileMessagesPanel from './MobileMessagesPanel';

interface Props {
  signedIn: boolean;
  canSendGlobalBroadcast: boolean;
}

export default function MobileMessages({
  signedIn,
  canSendGlobalBroadcast,
}: Props) {
  return (
    <MobileMessagesPanel
      signedIn={signedIn}
      canSendGlobalBroadcast={canSendGlobalBroadcast}
    />
  );
}

