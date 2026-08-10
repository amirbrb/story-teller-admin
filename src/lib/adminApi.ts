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
// of each. `ai_settings` holds which model runs the app's internal, machine-facing calls (chapter
// summaries, the draft quality critic, style analysis) — those are never writer-visible.
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
