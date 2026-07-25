import { createClient } from '@supabase/supabase-js'

function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return ''

  const trimmedUrl = rawUrl.trim().replace(/\/+$/, '')
  return trimmedUrl.replace(/\/(rest|auth)\/v1$/, '')
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || '')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null
