#!/usr/bin/env node
/**
 * Secure one-shot Super Admin bootstrap for NATIUM production.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=you@domain.com \
 *     node scripts/create-platform-admin.mjs
 *
 * - Does not print or store the service role key.
 * - Generates a one-time password (shown once) unless ADMIN_PASSWORD is set.
 * - Never commits credentials. platform_admin cannot be self-assigned via public signup.
 */
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const fullName = (process.env.ADMIN_FULL_NAME || 'NATIUM Super Admin').trim()

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
if (!email || !email.includes('@')) {
  console.error('Set ADMIN_EMAIL to the owner email.')
  process.exit(1)
}

const password =
  process.env.ADMIN_PASSWORD ||
  randomBytes(18)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 24)

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: listed, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
})
if (listError) {
  console.error('listUsers failed:', listError.message)
  process.exit(1)
}

const existing = listed.users.find((u) => (u.email || '').toLowerCase() === email)
let userId = existing?.id

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'coach' },
  })
  if (error) {
    console.error('createUser failed:', error.message)
    process.exit(1)
  }
  userId = data.user.id
  console.log('Created auth user.')
  console.log('One-time password (store securely, change after login):', password)
} else {
  console.log('Auth user already exists; promoting profile only.')
  console.log('Use /reset-password if you need a new password.')
}

const { error: upsertError } = await admin.from('profiles').upsert(
  {
    id: userId,
    email,
    full_name: fullName,
    role: 'platform_admin',
    account_status: 'active',
  },
  { onConflict: 'id' },
)
if (upsertError) {
  // Fallback if account_status column not yet applied
  const { error: roleError } = await admin
    .from('profiles')
    .update({ role: 'platform_admin', full_name: fullName, email })
    .eq('id', userId)
  if (roleError) {
    console.error('profile update failed:', roleError.message)
    process.exit(1)
  }
}

const { error: auditError } = await admin.from('audit_logs').insert({
  actor_id: userId,
  action: 'rpc:bootstrap_platform_admin',
  entity: 'profiles',
  entity_id: userId,
  metadata: { module: 'admin', result: 'ok', email },
})
if (auditError) {
  console.warn('audit insert skipped:', auditError.message)
}

console.log('Super Admin ready.')
console.log('Email:', email)
console.log('Admin URL: https://natium-weld.vercel.app/admin')
console.log('Login URL: https://natium-weld.vercel.app/login')
