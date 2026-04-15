import { supabase } from './supabase.js'
import { createTask, setAIMemory } from './db.js'

export async function migrateFromLocalStorage() {
  const migrated = localStorage.getItem('supabase_migrated')
  if (migrated) return

  try {
    // Migrate tasks
    const tasks = JSON.parse(localStorage.getItem('tasks') || '[]')
    for (const task of tasks) {
      await createTask(task)
    }

    // Migrate AI memory
    const memory = JSON.parse(localStorage.getItem('ai_memory') || '{}')
    for (const [key, value] of Object.entries(memory)) {
      await setAIMemory(key, String(value))
    }

    localStorage.setItem('supabase_migrated', 'true')
    console.log('✅ Migration complete')
  } catch (err) {
    console.error('Migration error:', err)
  }
}