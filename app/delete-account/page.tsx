import { redirect } from "next/navigation";

/** Old URL — bookmarks and store listings should use `/delete-data`. */
export default function DeleteAccountRedirectPage() {
  redirect("/delete-data");
}
