import { supabase } from './supabaseClient'

// Typed wrappers around the admin_* RPCs in story-teller/supabase/migrations/0012_admin.sql
// (and 0049_premium_credit.sql for everything money- and feature-flag-related).
// Every admin mutation goes through these instead of a direct table write — the RPCs check
// is_admin() themselves, so this is a convenience layer, not the security boundary.

export type AdminUserRow = {
  id: string
  email: string
  display_name: string
  is_premium: boolean
  premium_source: 'none' | 'admin' | 'paddle'
  is_admin: boolean
  chapter_autosave_enabled: boolean
  credit_micros: number
  created_at: string
  total_count: number
}

export type AdminUserDetail = {
  id: string
  email: string
  display_name: string
  is_premium: boolean
  premium_source: 'none' | 'admin' | 'paddle'
  premium_granted_at: string | null
  is_admin: boolean
  chapter_autosave_enabled: boolean
  credit_micros: number
  paddle_customer_id: string | null
  has_pending_premium_request: boolean
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

// Amounts are micro-dollars (1e-6 USD) everywhere money is handled — see 0049_premium_credit.sql
// for why integers rather than floats. The UI converts at the edges; nothing in between rounds.
export async function grantCredit(profileId: string, amountMicros: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_grant_credit', {
    p_target_profile_id: profileId,
    p_amount_micros: amountMicros,
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

// Per-user kill switch for the chapter_drafts autosave (story-teller/supabase/migrations/
// 0024_chapter_autosave_flag.sql) — on by default, flipped off here for a specific writer.
export async function setChapterAutosave(profileId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_chapter_autosave', {
    p_target_profile_id: profileId,
    p_enabled: enabled,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------------------------
// AI model configuration (story-teller/supabase/migrations/0014_admin_ai_models.sql)
//
// `ai_chapter_models` is the list of models a writer can pick between when drafting. Models carry
// no price any more (0049_premium_credit.sql): a call is billed on what it actually cost at
// OpenRouter. `ai_settings` holds which model runs the app's internal, machine-facing calls (the
// story bible, style analysis) — those are never writer-visible.
// ---------------------------------------------------------------------------------------------

export type AiModelRow = {
  id: string
  label: string
  description: string | null
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
  sort_order: number
  is_enabled: boolean
}): Promise<void> {
  const { error } = await supabase.rpc('admin_upsert_ai_model', {
    p_id: model.id,
    p_label: model.label,
    p_description: model.description,
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
// Community challenges (story-teller/supabase/migrations/0047_challenges.sql,
// 0048_challenge_target_locale.sql)
//
// Reads are a plain select — `challenges` carries a public-read RLS policy (the writer-facing app
// needs it too), so there's no need for a list RPC the way admin_list_ai_models exists. Writes go
// through admin_upsert_challenge/admin_delete_challenge, which check is_admin() themselves.
//
// target_locale is optional (null = shown to everyone) and, when set, scopes a challenge to
// writers currently reading Nibb in that language — 'en' or 'he', matching the main app's
// i18n language codes. It's a language target, not a country/geolocation one (0048's comment
// explains why): Nibb already segments by UI language, and a raw geographic check would hide a
// Hebrew challenge from a diaspora Hebrew writer and vice versa.
// ---------------------------------------------------------------------------------------------

export type ChallengeRow = {
  id: string
  title: string
  description: string
  start_date: string
  end_date: string
  target_locale: string | null
  created_at: string
}

export async function listChallenges(): Promise<ChallengeRow[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id,title,description,start_date,end_date,target_locale,created_at')
    .order('start_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function upsertChallenge(challenge: {
  id: string | null
  title: string
  description: string
  start_date: string
  end_date: string
  target_locale: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('admin_upsert_challenge', {
    p_id: challenge.id,
    p_title: challenge.title,
    p_description: challenge.description,
    p_start_date: challenge.start_date,
    p_end_date: challenge.end_date,
    p_target_locale: challenge.target_locale,
  })
  if (error) throw error
}

export async function deleteChallenge(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_challenge', { p_id: id })
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
  'suggest-continuation',
  'maintain-story-bible',
  'rebuild-story-bible',
  'analyze-story-style',
] as const

export const SYSTEM_ERROR_FUNCTION_NAMES = [
  'generate-chapter',
  'generate-branch-suggestions',
  'suggest-continuation',
  'analyze-story-style',
  'rebuild-story-bible',
  'submit-chapter',
  'moderate-chapter',
  'request-content-review',
  'admin-content-review',
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
  charged_micros: number | null
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
  'prompt_tokens, completion_tokens, total_tokens, cost_usd, generation_id, charged_micros, latency_ms, attempt, ' +
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

// ---------------------------------------------------------------------------------------------
// In-app feedback (story-teller/supabase/migrations/0042_feedback_attachments.sql,
// 0043_feedback.sql)
//
// Listing reads `feedback` directly under its admin RLS policy, same as ai_call_log/
// system_error_log above. Writes (status changes) and attachment-URL signing go through the
// `admin-feedback` Edge Function instead — the table has no client insert/update policy on
// purpose, and attachment paths only resolve to a URL via the service role. See
// story-teller/supabase/functions/admin-feedback and CLAUDE.md's "Edge functions and the MCP
// server" section: this is also what backs the file-feedback skill's Trello sync, so a status
// this page sets shows up there too and vice versa.
// ---------------------------------------------------------------------------------------------

export type FeedbackStatus = 'new' | 'filed' | 'dismissed'

export type FeedbackAttachment = { path: string; kind: 'image' | 'video'; name: string }
export type SignedFeedbackAttachment = { kind: 'image' | 'video'; name: string; url: string | null }

export type FeedbackRow = {
  id: string
  number: number
  created_at: string
  reporter_name: string | null
  profile_id: string | null
  message: string
  page: string | null
  language: string | null
  user_agent: string | null
  attachments: FeedbackAttachment[]
  status: FeedbackStatus
  card_url: string | null
  filed_at: string | null
}

export type FeedbackFilters = {
  status?: string
  dateFrom?: string
  dateTo?: string
}

const FEEDBACK_LIST_COLUMNS =
  'id, number, created_at, reporter_name, profile_id, message, page, language, user_agent, ' +
  'attachments, status, card_url, filed_at'

export async function listFeedback(
  filters: FeedbackFilters,
  limit: number,
  offset: number,
): Promise<{ rows: FeedbackRow[]; total: number }> {
  let query = supabase
    .from('feedback')
    .select(FEEDBACK_LIST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', endOfDay(filters.dateTo))

  const { data, error, count } = await query
  if (error) throw error
  return { rows: (data ?? []) as unknown as FeedbackRow[], total: count ?? 0 }
}

export async function getFeedbackEntry(id: string): Promise<FeedbackRow | null> {
  const { data, error } = await supabase.from('feedback').select(FEEDBACK_LIST_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as unknown as FeedbackRow) ?? null
}

export async function signFeedbackAttachments(feedbackId: string): Promise<SignedFeedbackAttachment[]> {
  const { data, error } = await supabase.functions.invoke<{ attachments: SignedFeedbackAttachment[] }>(
    'admin-feedback',
    { body: { action: 'sign_attachments', feedback_id: feedbackId } },
  )
  if (error) throw error
  return data?.attachments ?? []
}

export async function setFeedbackStatus(feedbackId: string, status: FeedbackStatus, cardUrl?: string): Promise<void> {
  const { error } = await supabase.functions.invoke('admin-feedback', {
    body: { action: 'set_status', feedback_id: feedbackId, status, card_url: cardUrl },
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------------------------
// Content review requests (story-teller/supabase/migrations/0046_content_review_requests.sql)
//
// A writer's explicit save/publish can be hard-rejected by automatic moderation
// (moderation.categories['sexual/minors'] in _shared/chapterSave.ts) with no client-side bypass —
// request-content-review queues the exact rejected content here instead, for a human to decide.
// Listing/reading goes straight to the table under its admin RLS policy, same as feedback; the
// decision itself goes through admin-content-review, since approving re-saves the chapter via the
// service-role client (skipping moderation, forcing a 'mature' rating) and rejecting requires
// recording why — the writer sees that note verbatim in their notification, so it's not optional.
//
// No embedded `profiles(...)`/`stories(...)` selects here: this table has two FKs to `profiles`
// (profile_id, reviewed_by) and two to `chapters` (chapter_id, resulting_chapter_id), which
// PostgREST can't auto-disambiguate the way the single-FK embeds elsewhere in this file do — pages
// resolve story/writer names with a second lookup instead, same as story-teller's NotificationHub.
// ---------------------------------------------------------------------------------------------

export type ContentReviewStatus = 'pending' | 'approved' | 'rejected'

export type ContentReviewRow = {
  id: string
  story_id: string
  chapter_id: string | null
  profile_id: string | null
  content: string
  title: string | null
  kind: 'chapter' | 'prologue' | 'epilogue'
  language: string
  ai_assistance: 'none' | 'assisted' | 'generated' | null
  publish: boolean
  moderation_categories: string[]
  status: ContentReviewStatus
  review_note: string | null
  resulting_chapter_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export type ContentReviewFilters = {
  status?: string
  dateFrom?: string
  dateTo?: string
}

const CONTENT_REVIEW_LIST_COLUMNS =
  'id, story_id, chapter_id, profile_id, content, title, kind, language, ai_assistance, publish, ' +
  'moderation_categories, status, review_note, resulting_chapter_id, reviewed_by, reviewed_at, created_at'

export async function listContentReviews(
  filters: ContentReviewFilters,
  limit: number,
  offset: number,
): Promise<{ rows: ContentReviewRow[]; total: number }> {
  let query = supabase
    .from('content_review_requests')
    .select(CONTENT_REVIEW_LIST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', endOfDay(filters.dateTo))

  const { data, error, count } = await query
  if (error) throw error
  return { rows: (data ?? []) as unknown as ContentReviewRow[], total: count ?? 0 }
}

export async function getContentReviewEntry(id: string): Promise<ContentReviewRow | null> {
  const { data, error } = await supabase.from('content_review_requests').select(CONTENT_REVIEW_LIST_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as unknown as ContentReviewRow) ?? null
}

// Small helper the list/detail pages both need: given a set of story/profile ids gathered from
// content_review_requests rows, resolve them to display titles/names in one round trip each.
export async function lookupStoryTitles(storyIds: string[]): Promise<Record<string, string>> {
  if (storyIds.length === 0) return {}
  const { data, error } = await supabase.from('stories').select('id,title').in('id', storyIds)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((s) => [s.id, s.title]))
}

export async function lookupProfileNames(profileIds: string[]): Promise<Record<string, string>> {
  if (profileIds.length === 0) return {}
  const { data, error } = await supabase.from('profiles').select('id,display_name').in('id', profileIds)
  if (error) throw error
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.display_name]))
}

export async function approveContentReview(requestId: string, reviewNote?: string): Promise<void> {
  const { error } = await supabase.functions.invoke('admin-content-review', {
    body: { action: 'approve', request_id: requestId, review_note: reviewNote },
  })
  if (error) throw error
}

export async function rejectContentReview(requestId: string, reviewNote: string): Promise<void> {
  const { error } = await supabase.functions.invoke('admin-content-review', {
    body: { action: 'reject', request_id: requestId, review_note: reviewNote },
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------------------------
// Feature flags and billing (story-teller/supabase/migrations/0049_premium_credit.sql)
//
// Flags are per-user and both seeded ones default off, so this is where the premium rollout is
// actually driven: `ai_credit_metering` decides whether a writer's AI usage is billed against
// credit, and `paddle_checkout` decides whether they get real checkout or the "coming soon" path.
// Turning a flag back off is the rollback.
// ---------------------------------------------------------------------------------------------

export type FeatureFlagRow = {
  key: string
  label: string
  description: string | null
  default_enabled: boolean
  override_count: number
  enabled_count: number
}

export type FlagOverrideRow = {
  profile_id: string
  email: string
  display_name: string
  enabled: boolean
  updated_at: string
  total_count: number
}

export type PremiumRequestRow = {
  id: string
  profile_id: string
  email: string
  display_name: string
  is_premium: boolean
  credit_micros: number
  checkout_enabled: boolean
  created_at: string
  notified_at: string | null
  resolved_at: string | null
}

export type CreditPackRow = {
  paddle_price_id: string
  kind: 'premium' | 'topup'
  label: string
  description: string | null
  credit_micros: number
  grants_premium: boolean
  display_amount: string
  sort_order: number
  is_enabled: boolean
}

export type BillingSettingRow = {
  key: string
  value: string
  updated_at: string
}

export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const { data, error } = await supabase.rpc('admin_list_feature_flags')
  if (error) throw error
  return data ?? []
}

export async function upsertFeatureFlag(flag: {
  key: string
  label: string
  description: string | null
  default_enabled: boolean
}): Promise<void> {
  const { error } = await supabase.rpc('admin_upsert_feature_flag', {
    p_key: flag.key,
    p_label: flag.label,
    p_description: flag.description,
    p_default_enabled: flag.default_enabled,
  })
  if (error) throw error
}

export async function deleteFeatureFlag(key: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_feature_flag', { p_key: key })
  if (error) throw error
}

export async function listFlagOverrides(key: string, limit: number, offset: number): Promise<FlagOverrideRow[]> {
  const { data, error } = await supabase.rpc('admin_list_flag_overrides', {
    p_key: key,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return data ?? []
}

export async function setProfileFlag(profileId: string, key: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_profile_flag', {
    p_target_profile_id: profileId,
    p_key: key,
    p_enabled: enabled,
  })
  if (error) throw error
}

// Not the same as setting it false: clearing hands the writer back to the flag's default, which is
// what an operator means by "undo what I did to this person".
export async function clearProfileFlag(profileId: string, key: string): Promise<void> {
  const { error } = await supabase.rpc('admin_clear_profile_flag', {
    p_target_profile_id: profileId,
    p_key: key,
  })
  if (error) throw error
}

export async function listPremiumRequests(includeResolved = false): Promise<PremiumRequestRow[]> {
  const { data, error } = await supabase.rpc('admin_list_premium_requests', {
    p_include_resolved: includeResolved,
  })
  if (error) throw error
  return data ?? []
}

export async function resolvePremiumRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_resolve_premium_request', { p_id: id })
  if (error) throw error
}

export async function listCreditPacks(): Promise<CreditPackRow[]> {
  const { data, error } = await supabase.rpc('admin_list_credit_packs')
  if (error) throw error
  return data ?? []
}

export async function upsertCreditPack(pack: CreditPackRow): Promise<void> {
  const { error } = await supabase.rpc('admin_upsert_credit_pack', {
    p_paddle_price_id: pack.paddle_price_id,
    p_kind: pack.kind,
    p_label: pack.label,
    p_description: pack.description,
    p_credit_micros: pack.credit_micros,
    p_grants_premium: pack.grants_premium,
    p_display_amount: pack.display_amount,
    p_sort_order: pack.sort_order,
    p_is_enabled: pack.is_enabled,
  })
  if (error) throw error
}

export async function deleteCreditPack(paddlePriceId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_credit_pack', { p_paddle_price_id: paddlePriceId })
  if (error) throw error
}

export async function listBillingSettings(): Promise<BillingSettingRow[]> {
  const { data, error } = await supabase.rpc('admin_list_billing_settings')
  if (error) throw error
  return data ?? []
}

export async function setBillingSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_billing_setting', { p_key: key, p_value: value })
  if (error) throw error
}

// A writer's credit ledger, read straight from the table through its admin-read policy.
export type CreditTransactionRow = {
  id: string
  amount_micros: number
  reason: string
  balance_after_micros: number
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function listCreditTransactions(profileId: string, limit = 50): Promise<CreditTransactionRow[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('id, amount_micros, reason, balance_after_micros, metadata, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// Money is stored as micro-dollars; operators think in dollars. These two are the only place that
// conversion happens, so a rounding mistake can't spread.
export function microsToDollars(micros: number): string {
  return (micros / 1_000_000).toFixed(2)
}

export function dollarsToMicros(dollars: string): number {
  return Math.round(Number(dollars) * 1_000_000)
}
