import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ownerEmailArg = process.argv[2] || ''
const ownerEmail = (ownerEmailArg || process.env.VITE_OWNER_EMAIL || process.env.OWNER_EMAIL || '').trim().toLowerCase()
const force = process.argv.includes('--force')

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!ownerEmail) {
  console.error('Provide owner email: node backend/bootstrap-owner.mjs owner@email.com')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findUserByEmail(email) {
  const target = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const users = data?.users || []
    const match = users.find((user) => (user.email || '').toLowerCase() === target)
    if (match) return match
    if (users.length < 200) break
  }
  return null
}

async function main() {
  const { data: existingRoles, error: roleError } = await supabase.from('user_roles').select('user_id,role').eq('role', 'owner').limit(1)
  if (roleError) throw roleError
  if ((existingRoles || []).length > 0 && !force) {
    console.error('Owner already exists. Re-run with --force to replace owner role assignment.')
    process.exit(1)
  }

  const user = await findUserByEmail(ownerEmail)
  if (!user?.id) {
    console.error(`No auth user found for email: ${ownerEmail}`)
    process.exit(1)
  }

  const { error } = await supabase
    .from('user_roles')
    .upsert(
      {
        user_id: user.id,
        role: 'owner',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  if (error) throw error

  console.log(`Owner assigned: ${ownerEmail} (${user.id})`)
}

main().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
