import { getAuthUser } from "@/lib/auth";
import MapSharingSwitcher from "./MapSharingSwitcher";

export const dynamic = "force-dynamic";

export default async function MapSharingSettingsPage() {
  const authUser = await getAuthUser();
  const signedIn = Boolean(authUser);
  const isAdmin = authUser?.isAdmin ?? false;

  return (
    <MapSharingSwitcher signedIn={signedIn} isAdmin={isAdmin} />
  );
}
