import { supabase } from '../lib/supabase'

export function extractYouTubeId(input) {
  if (!input) return ''
  const raw = String(input).trim()
  // already a bare 11-char id
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/watch\?(?:[^&]*&)*v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = raw.match(re)
    if (m) return m[1]
  }
  return raw // unrecognized: store as-is so a bad paste fails visibly (no thumbnail) rather than silently wrong
}

// ── Public queries (authenticated users) ─────────────────────────────────

export async function getAcademyModules({ isAdmin } = {}) {
  let query = supabase
    .from('academy_modules')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (!isAdmin) {
    query = query.eq('audience', 'all')
  }
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getAcademyVideos({ tradeVertical, isAdmin } = {}) {
  let query = supabase
    .from('academy_videos')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (!isAdmin) {
    query = query.eq('audience', 'all')
  }

  const { data, error } = await query
  if (error) throw error
  const rows = data ?? []

  if (!tradeVertical || tradeVertical === 'all') return rows
  return rows.filter(v => v.trade_vertical === 'all' || v.trade_vertical === tradeVertical)
}

export async function getPublishedQuestions() {
  const { data, error } = await supabase
    .from('academy_questions')
    .select('id, question, answer, answered_at, video_id')
    .eq('is_published', true)
    .order('answered_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getMyQuestions(userId) {
  const { data, error } = await supabase
    .from('academy_questions')
    .select('id, question, answer, answered_at, video_id, notify_method, is_published, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function submitQuestion({ companyId, question, videoId, notifyMethod }) {
  const { data, error } = await supabase
    .from('academy_questions')
    .insert({
      company_id: companyId,
      question,
      video_id: videoId || null,
      notify_method: notifyMethod || 'email',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Admin queries (super-admin only — RLS enforces) ──────────────────────

export async function getAllModules() {
  const { data, error } = await supabase
    .from('academy_modules')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getAllVideos() {
  const { data, error } = await supabase
    .from('academy_videos')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createModule(payload) {
  const { data, error } = await supabase
    .from('academy_modules')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateModule(id, patch) {
  const { error } = await supabase
    .from('academy_modules')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

export async function deleteModule(id) {
  const { error } = await supabase
    .from('academy_modules')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function createVideo(payload) {
  const { data, error } = await supabase
    .from('academy_videos')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateVideo(id, patch) {
  const { error } = await supabase
    .from('academy_videos')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

export async function deleteVideo(id) {
  const { error } = await supabase
    .from('academy_videos')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getQuestionsForInbox() {
  const { data, error } = await supabase
    .from('academy_questions')
    .select('*, companies(name), academy_videos(title)')
    .order('answered_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function answerQuestion({ id, answer, isPublished }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('academy_questions')
    .update({
      answer,
      answered_by: user.id,
      answered_at: new Date().toISOString(),
      is_published: isPublished,
    })
    .eq('id', id)
  if (error) throw error
}
