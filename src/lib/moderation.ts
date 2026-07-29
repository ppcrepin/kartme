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
  /** Chemin de la photo signalée : la modération doit VOIR ce qu'elle retire. */
  reportedAvatarPath: string | null;
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
  reported_avatar_path: string | null;
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
    reportedAvatarPath: r.reported_avatar_path ?? null,
    raceId: r.race_id,
    raceCircuit: r.race_circuit,
  }));
}

export async function countOpenReports(): Promise<number> {
  const { data, error } = await supabase.rpc('count_open_reports');
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

/** Signalement de circuit (karting manquant / fermé / fiche fausse). */
export interface CircuitSuggestion {
  id: string;
  kind: 'manquant' | 'ferme' | 'erreur';
  name: string;
  city: string | null;
  status: 'open' | 'done' | 'rejected';
  createdAt: string;
  authorName: string | null;
  circuitId: string | null;
  circuitName: string | null;
}

type RawSuggestion = {
  id: string; kind: CircuitSuggestion['kind']; name: string; city: string | null;
  status: CircuitSuggestion['status']; created_at: string;
  author_id: string; author_name: string | null;
  circuit_id: string | null; circuit_name: string | null;
};

export async function listCircuitSuggestions(onlyOpen = true): Promise<CircuitSuggestion[]> {
  const { data, error } = await supabase.rpc('list_circuit_suggestions', { p_only_open: onlyOpen });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawSuggestion[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    city: r.city,
    status: r.status,
    createdAt: r.created_at,
    authorName: r.author_name,
    circuitId: r.circuit_id,
    circuitName: r.circuit_name,
  }));
}

export async function resolveCircuitSuggestion(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.rpc('resolve_circuit_suggestion', { p_id: id, p_done: done });
  if (error) throw new Error(error.message);
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
