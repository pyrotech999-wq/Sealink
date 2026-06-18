import type { Metadata } from 'next';
import { getAuthUser } from '@/lib/auth';
import AnchorAlarmClientController from './AnchorAlarmClientController';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Anchor alarm',
  description:
    'Arm a geofence and get drift alerts. On the Android app, optional background anchor monitoring uses a foreground location service with a persistent notification — only after you arm with this device as the monitor.',
};

export default async function AnchorAlarmPage() {
  const authUser = await getAuthUser();
  const signedIn = Boolean(authUser);
  const isAdmin = authUser?.isAdmin ?? false;

  return (
    <AnchorAlarmClientController signedIn={signedIn} isAdmin={isAdmin} />
  );
}