/**
 * Couche modération (lot 3.1b) — réservée aux modérateurs.
 * Toutes les opérations passent par des RPC SECURITY DEFINER qui vérifient
 * `is_moderator(auth.uid())` côté serveur ; ici on ne fait que les appeler.
 */
import { supabase } from '@/lib/supabase';

export type ReportCategory = 'comportement' | 'fausse_course' | 'classement' | 'usurpation' | 'photo' | 'autre';
export type ReportStatus = 'open' | 'handled' | 'dismissed';

export interface Report {
  id: string;
  category: ReportCategory;
  message: string | null;
  status: ReportStatus;
  createdAt: string;
  reporterId: string | null;
  reporterName: string | null;
  reportedId: string | null;
  reportedName: string | null;
  reportedSuspended: boolean;
  raceId: string | null;
  raceCircuit: string | null;
}

type RawReport = {
  id: string;
  category: ReportCategory;
  message: string | null;
  status: ReportStatus;
  created_at: string;
  reporter_id: string | null;
  reporter_name: string | null;
  reported_id: string | null;
  reported_name: string | null;
  reported_suspended: boolean;
  race_id: string | null;
  race_circuit: string | null;
};

export async function listReports(onlyOpen = false): Promise<Report[]> {
  const { data, error } = await supabase.rpc('list_reports', { p_only_open: onlyOpen });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawReport[]).map((r) => ({
    id: r.id,
    category: r.category,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    reporterId: r.reporter_id,
    reporterName: r.reporter_name,
    reportedId: r.reported_id,
    reportedName: r.reported_name,
    reportedSuspended: r.reported_suspended,
    raceId: r.race_id,
    raceCircuit: r.race_circuit,
  }));
}

export async function countOpenReports(): Promise<number> {
  const { data, error } = await supabase.rpc('count_open_reports');
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function resolveReport(reportId: string, status: ReportStatus): Promise<void> {
  const { error } = await supabase.rpc('moderate_resolve', { p_report_id: reportId, p_status: status });
  if (error) throw new Error(error.message);
}

export async function renamePilot(profileId: string, newName: string): Promise<void> {
  const { error } = await supabase.rpc('moderate_rename_pilot', {
    p_profile_id: profileId,
    p_new_name: newName,
  });
  if (error) throw new Error(error.message);
}

/**
 * Retire la photo de profil d'un pilote (décision PO : signalement puis
 * retrait, pas de validation a priori). Le fichier reste dans le bucket mais
 * devient illisible : la policy de lecture exige que le chemin soit CELUI
 * référencé par le profil.
 */
export async function removePilotAvatar(profileId: string): Promise<void> {
  const { error } = await supabase.rpc('moderate_remove_avatar', { p_profile_id: profileId });
  if (error) throw new Error(error.message);
}

export async function suspendPilot(profileId: string, suspend: boolean): Promise<void> {
  const { error } = await supabase.rpc('moderate_suspend', { p_profile_id: profileId, p_suspend: suspend });
  if (error) throw new Error(error.message);
}

export async function deleteReportedRace(raceId: string): Promise<void> {
  const { error } = await supabase.rpc('moderate_delete_race', { p_race_id: raceId });
  if (error) throw new Error(error.message);
}
