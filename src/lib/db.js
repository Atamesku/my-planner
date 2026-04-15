import { supabase } from './supabase'

const USER_ID = 'default' // replace with auth user ID later

// ── TASKS ──────────────────────────────────────────────
export async function getTasks(date) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('date', date)
    .order('created_at')
  if (error) throw error
  return data
}

export async function createTask(task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...task, user_id: USER_ID })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTask(id, updates) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// ── AI MEMORY ──────────────────────────────────────────
export async function getAIMemory() {
  const { data, error } = await supabase
    .from('ai_memory')
    .select('key, value')
    .eq('user_id', USER_ID)
  if (error) return []
  return data || []
}

export async function setAIMemory(key, value) {
  const { error } = await supabase
    .from('ai_memory')
    .upsert(
      { user_id: USER_ID, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    )
  if (error) console.error('setAIMemory error:', error)
}

// ── SUBJECTS & ASSIGNMENTS ─────────────────────────────
export async function getSubjectsWithAssignments() {
  const { data, error } = await supabase
    .from('subjects')
    .select('*, assignments(*)')
    .eq('user_id', USER_ID)
    .order('name')
  if (error) throw error
  return data
}

export async function createSubject(name) {
  const { data, error } = await supabase
    .from('subjects')
    .insert({ name, user_id: USER_ID })
    .select().single()
  if (error) throw error
  return data
}

export async function upsertAssignment(assignment) {
  const { data, error } = await supabase
    .from('assignments')
    .upsert({ ...assignment, user_id: USER_ID })
    .select().single()
  if (error) throw error
  return data
}

// ── WEEKLY REVIEW ──────────────────────────────────────
export async function getWeeklyReview(weekStart) {
  const { data } = await supabase
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('week_start', weekStart)
    .maybeSingle()
  return data
}

export async function saveWeeklyReview(weekStart, review) {
  const { data, error } = await supabase
    .from('weekly_reviews')
    .upsert({ ...review, user_id: USER_ID, week_start: weekStart },
             { onConflict: 'user_id,week_start' })
    .select().single()
  if (error) throw error
  return data
}

// ── READING LIST ───────────────────────────────────────
export async function getReadingList() {
  const { data, error } = await supabase
    .from('reading_list')
    .select('*')
    .eq('user_id', USER_ID)
    .order('added_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addBook(book) {
  const { data, error } = await supabase
    .from('reading_list')
    .insert({ ...book, user_id: USER_ID })
    .select().single()
  if (error) throw error
  return data
}

export async function updateBookStatus(id, status) {
  const { data, error } = await supabase
    .from('reading_list')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', id)
    .select().single()
  if (error) throw error
  return data
}