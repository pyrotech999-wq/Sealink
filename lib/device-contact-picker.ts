/** True when the [Contact Picker API](https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API) may be available (usually Chrome/Android over HTTPS). */
export function isContactPickerAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  const c = (navigator as Navigator & { contacts?: { select?: unknown } }).contacts;
  return Boolean(c && typeof c.select === "function");
}

type PickedContact = { email?: string[] };

/**
 * Opens the OS contact picker; returns distinct email addresses the user selected.
 * User gesture required; throws if unsupported or user cancels.
 */
export async function pickEmailsFromDeviceContacts(): Promise<string[]> {
  const nav = navigator as Navigator & {
    contacts?: { select(props: string[], opts?: { multiple?: boolean }): Promise<PickedContact[]> };
  };
  if (!nav.contacts?.select) return [];
  const picked = await nav.contacts.select(["email"], { multiple: true });
  const raw: string[] = [];
  for (const c of picked) {
    for (const e of c.email ?? []) {
      const t = e.trim();
      if (t) raw.push(t);
    }
  }
  return [...new Set(raw.map((x) => x.toLowerCase()))];
}
