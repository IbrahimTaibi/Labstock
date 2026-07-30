import { createClient } from "./supabase/server";
import type { LabsWorkspaceData, LabUser, Laboratory } from "./types";

/** Laboratoires et comptes, pour l'écran d'administration (admin uniquement). */
export async function getLabsWorkspace(
  activeLabId: number | null
): Promise<LabsWorkspaceData> {
  const supabase = await createClient();

  const [labsRes, usersRes] = await Promise.all([
    supabase.from("laboratories").select("id, name, created_at").order("id"),
    supabase
      .from("profiles")
      .select("id, email, full_name, role, lab_id")
      .order("email"),
  ]);

  if (labsRes.error)
    throw new Error(`Chargement des laboratoires : ${labsRes.error.message}`);
  if (usersRes.error)
    throw new Error(`Chargement des comptes : ${usersRes.error.message}`);

  const users = (usersRes.data ?? []) as LabUser[];

  const laboratories: Laboratory[] = (labsRes.data ?? []).map((lab) => ({
    id: lab.id,
    name: lab.name,
    created_at: lab.created_at,
    member_count: users.filter((u) => u.lab_id === lab.id).length,
    is_active: lab.id === activeLabId,
  }));

  return { laboratories, users };
}
