import { supabase } from './supabaseClient'

// Typed wrappers around the admin_* RPCs in story-teller/supabase/migrations/0012_admin.sql.
// Every admin mutation goes through these instead of a direct table write — the RPCs check
// is_admin() themselves, so this is a convenience layer, not the security boundary.

export type AdminUserRow = {
  id: string
  email: string
  display_name: string
  is_premium: boolean
  is_admin: boolean
  token_balance: number
  created_at: string
  total_count: number
}

export type AdminUserDetail = {
  id: string
  email: string
  display_name: string
  is_premium: boolean
  is_admin: boolean
  token_balance: number
  created_at: string
  bio: string | null
  avatar_url: string | null
  adult_content_allowed: boolean
}

export async function listUsers(search: string, limit: number, offset: number): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data ?? []
}

export async function getUser(profileId: string): Promise<AdminUserDetail | null> {
  const { data, error } = await supabase.rpc('admin_get_user', { p_target_profile_id: profileId })
  if (error) throw error
  return data?.[0] ?? null
}

export async function grantTokens(profileId: string, amount: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_grant_tokens', {
    p_target_profile_id: profileId,
    p_amount: amount,
    p_note: note || null,
  })
  if (error) throw error
  return data as number
}

export async function setPremium(profileId: string, isPremium: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_premium', {
    p_target_profile_id: profileId,
    p_is_premium: isPremium,
  })
  if (error) throw error
}

export async function setAdmin(profileId: string, isAdmin: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_admin', {
    p_target_profile_id: profileId,
    p_is_admin: isAdmin,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------------------------
// AI model configuration (story-teller/supabase/migrations/0014_admin_ai_models.sql)
//
// `ai_chapter_models` is the list of models a writer can pick between when drafting, and the price
// of each. `ai_settings` holds which model runs the app's internal, machine-facing calls (the story
// bible, style analysis) — those are never writer-visible.
// ---------------------------------------------------------------------------------------------

export type AiModelRow = {
  id: string
  label: string
  description: string | null
  token_cost: number
  sort_order: number
  is_enabled: boolean
  updated_at: string
}

export type AiSettingRow = {
  key: string
  value: string
  updated_at: string
}

export async function listAiModels(): Promise<AiModelRow[]> {
  const { data, error } = await supabase.rpc('admin_list_ai_models')
  if (error) throw error
  return data ?? []
}

// Insert-or-update by model id: the admin form is the same for adding a new model and editing an
// existing one, and the OpenRouter id is the natural key in both cases.
export async function upsertAiModel(model: {
  id: string
  label: string
  description: string | null
  token_cost: number
  sort_order: number
  is_enabled: boolean
}): Promise<void> {
  const { error } = await supabase.rpc('admin_upsert_ai_model', {
    p_id: model.id,
    p_label: model.label,
    p_description: model.description,
    p_token_cost: model.token_cost,
    p_sort_order: model.sort_order,
    p_is_enabled: model.is_enabled,
  })
  if (error) throw error
}

export async function deleteAiModel(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_ai_model', { p_id: id })
  if (error) throw error
}

export async function listAiSettings(): Promise<AiSettingRow[]> {
  const { data, error } = await supabase.rpc('admin_list_ai_settings')
  if (error) throw error
  return data ?? []
}

export async function setAiSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_ai_setting', { p_key: key, p_value: value })
  if (error) throw error
}

// ---------------------------------------------------------------------------------------------
// Logs (story-teller/supabase/migrations/0011_ai_call_log.sql, 0018_error_logging.sql)
//
// Plain selects rather than admin_* RPCs, unlike everything above. Both tables already carry an
// admin-read RLS policy and neither needs anything from auth.users — which is the only reason
// admin_list_users exists as a function at all. `count: 'exact'` gives the pager its total without
// the window-column trick those RPCs use.
//
// Read-only by design: there is no mutation to wrap here, and a log an operator can edit is not
// evidence of anything.
// ---------------------------------------------------------------------------------------------

export const AI_LOG_FUNCTION_NAMES = [
  'generate-chapter',
  // Retired: the app no longer runs a quality-check pass, so no new rows carry this name. Kept
  // here so historical rows stay filterable rather than only visible in the unfiltered view.
  'generate-chapter-quality-check',
  'generate-branch-suggestions',
  'maintain-story-bible',
  'rebuild-story-bible',
  'analyze-story-style',
] as const

export const SYSTEM_ERROR_FUNCTION_NAMES = [
  'generate-chapter',
  'generate-branch-suggestions',
  'analyze-story-style',
  'rebuild-story-bible',
  'submit-chapter',
  'moderate-chapter',
] as const

export type AiCallLogRow = {
  id: string
  created_at: string
  function_name: string
  model: string
  profile_id: string
  story_id: string | null
  chapter_id: string | null
  status: 'success' | 'error'
  error_message: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  cost_usd: number | null
  generation_id: string | null
  token_cost: number
  latency_ms: number
  attempt: number
  profiles: { display_name: string | null } | null
}

// The list query omits these two deliberately (they are only ever populated on failures, and a
// page of them would be megabytes); the detail query is the only place they load.
export type AiCallLogDetailRow = AiCallLogRow & {
  request: string | null
  response: string | null
}

export type AiCallLogFilters = {
  functionName?: string
  status?: string
  profileId?: string
  dateFrom?: string
  dateTo?: string
}

const AI_LOG_LIST_COLUMNS =
  'id, created_at, function_name, model, profile_id, story_id, chapter_id, status, error_message, ' +
  'prompt_tokens, completion_tokens, total_tokens, cost_usd, generation_id, token_cost, latency_ms, attempt, ' +
  'profiles(display_name)'

// A date input yields 'YYYY-MM-DD', which Postgres reads as midnight — so an unadjusted `to` filter
// excludes the whole day the operator just asked for. Pushing it to the end of that day is what
// makes "from 1st to 1st" return the 1st.
function endOfDay(date: string): string {
  return `${date}T23:59:59.999`
}

export async function listAiCallLog(
  filters: AiCallLogFilters,
  limit: number,
  offset: number,
): Promise<{ rows: AiCallLogRow[]; total: number }> {
  let query = supabase
    .from('ai_call_log')
    .select(AI_LOG_LIST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filters.functionName) query = query.eq('function_name', filters.functionName)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.profileId) query = query.eq('profile_id', filters.profileId)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', endOfDay(filters.dateTo))

  const { data, error, count } = await query
  if (error) throw error
  return { rows: (data ?? []) as unknown as AiCallLogRow[], total: count ?? 0 }
}

export async function getAiCallLogEntry(id: string): Promise<AiCallLogDetailRow | null> {
  const { data, error } = await supabase
    .from('ai_call_log')
    .select(`${AI_LOG_LIST_COLUMNS}, request, response`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as AiCallLogDetailRow) ?? null
}

export type SystemErrorRow = {
  id: string
  created_at: string
  function_name: string
  kind: 'handled' | 'uncaught'
  status_code: number
  error_code: string | null
  error_message: string | null
  request_method: string
  profile_id: string | null
  latency_ms: number
  profiles: { display_name: string | null } | null
}

export type SystemErrorDetailRow = SystemErrorRow & {
  request_body: string | null
}

export type SystemErrorFilters = {
  functionName?: string
  kind?: string
  statusCode?: string
  profileId?: string
  dateFrom?: string
  dateTo?: string
}

const SYSTEM_ERROR_LIST_COLUMNS =
  'id, created_at, function_name, kind, status_code, error_code, error_message, request_method, ' +
  'profile_id, latency_ms, profiles(display_name)'

export async function listSystemErrors(
  filters: SystemErrorFilters,
  limit: number,
  offset: number,
): Promise<{ rows: SystemErrorRow[]; total: number }> {
  let query = supabase
    .from('system_error_log')
    .select(SYSTEM_ERROR_LIST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filters.functionName) query = query.eq('function_name', filters.functionName)
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.statusCode) query = query.eq('status_code', Number(filters.statusCode))
  if (filters.profileId) query = query.eq('profile_id', filters.profileId)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', endOfDay(filters.dateTo))

  const { data, error, count } = await query
  if (error) throw error
  return { rows: (data ?? []) as unknown as SystemErrorRow[], total: count ?? 0 }
}

export async function getSystemErrorEntry(id: string): Promise<SystemErrorDetailRow | null> {
  const { data, error } = await supabase
    .from('system_error_log')
    .select(`${SYSTEM_ERROR_LIST_COLUMNS}, request_body`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as SystemErrorDetailRow) ?? null
}
