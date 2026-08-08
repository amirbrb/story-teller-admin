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
