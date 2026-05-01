import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type MarinaBerthRequestRow = {
  id: string;
  userUid: string;
  userEmail: string;
  marinaId: string;
  marinaName: string;
  marinaPhone: string;
  arrival: string;
  departure: string;
  boatLengthM: number | null;
  note: string;
  status: string;
  createdAt: string;
};

function mapRow(r: Record<string, unknown>): MarinaBerthRequestRow {
  return {
    id: String(r.id ?? ""),
    userUid: String(r.user_uid ?? ""),
    userEmail: String(r.user_email ?? ""),
    marinaId: String(r.marina_id ?? ""),
    marinaName: String(r.marina_name ?? ""),
    marinaPhone: String(r.marina_phone ?? ""),
    arrival: String(r.arrival ?? ""),
    departure: String(r.departure ?? ""),
    boatLengthM: r.boat_length_m == null || r.boat_length_m === "" ? null : Number(r.boat_length_m),
    note: String(r.note ?? ""),
    status: String(r.status ?? "pending"),
    createdAt: String(r.created_at ?? ""),
  };
}

export async function createMarinaBerthRequest(input: {
  userUid: string;
  userEmail: string;
  marinaId: string;
  marinaName: string;
  marinaPhone: string;
  arrival: string;
  departure: string;
  boatLengthM: number | null;
  note: string;
}): Promise<MarinaBerthRequestRow> {
  if (!isSupabaseConfigured()) {
    throw new Error("SUPABASE_REQUIRED");
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("marina_berth_requests")
    .insert({
      user_uid: input.userUid,
      user_email: input.userEmail,
      marina_id: input.marinaId,
      marina_name: input.marinaName,
      marina_phone: input.marinaPhone,
      arrival: input.arrival,
      departure: input.departure,
      boat_length_m: input.boatLengthM,
      note: input.note,
    })
    .select("id, user_uid, user_email, marina_id, marina_name, marina_phone, arrival, departure, boat_length_m, note, status, created_at")
    .single();

  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Insert returned no row");
  return mapRow(data as Record<string, unknown>);
}

export async function listMarinaBerthRequestsForUser(userUid: string, limit = 40): Promise<MarinaBerthRequestRow[]> {
  if (!isSupabaseConfigured()) {
    throw new Error("SUPABASE_REQUIRED");
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("marina_berth_requests")
    .select("id, user_uid, user_email, marina_id, marina_name, marina_phone, arrival, departure, boat_length_m, note, status, created_at")
    .eq("user_uid", userUid)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}
