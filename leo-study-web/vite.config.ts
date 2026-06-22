import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, randomInt } from 'node:crypto'

// https://vite.dev/config/
const publicHmrHost = process.env.VITE_PUBLIC_HMR_HOST?.trim()

function localAuthApiPlugin(): Plugin {
  return {
    name: 'leo-local-auth-api',
    configureServer(server) {
      async function readJsonBody(req: IncomingMessage) {
        const body = await new Promise<string>((resolve, reject) => {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
          req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
          req.on('error', reject)
        })
        return JSON.parse(body || '{}')
      }

      function sendJson(res: ServerResponse, status: number, payload: unknown) {
        res.statusCode = status
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(payload))
      }

      function createServiceClient() {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceRoleKey) return null
        return createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      }

      function hashInviteCode(code: string) {
        return createHash('sha256').update(code.toUpperCase().replace(/\s+/g, '')).digest('hex')
      }

      function createFiveDigitCode() {
        return String(randomInt(0, 100000)).padStart(5, '0')
      }

      async function getAuthorizedClassManager(req: IncomingMessage, res: ServerResponse, classId: string) {
        const supabase = createServiceClient()
        if (!supabase) {
          sendJson(res, 500, { ok: false, error: 'Supabase server configuration is missing.' })
          return null
        }

        const authorization = String(req.headers.authorization || '')
        const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : ''
        if (!token) {
          sendJson(res, 401, { ok: false, error: 'Missing bearer token.' })
          return null
        }

        const { data: userData, error: userError } = await supabase.auth.getUser(token)
        const user = userData?.user || null
        if (userError || !user) {
          sendJson(res, 401, { ok: false, error: 'Invalid bearer token.' })
          return null
        }

        const [{ data: ownerRows }, { data: adminRows }] = await Promise.all([
          supabase.from('user_roles').select('user_id').eq('user_id', user.id).eq('role', 'owner').limit(1),
          supabase
            .from('class_memberships')
            .select('id')
            .eq('user_id', user.id)
            .eq('class_id', classId)
            .eq('role', 'class_admin')
            .eq('status', 'active')
            .limit(1),
        ])
        if (!ownerRows?.length && !adminRows?.length) {
          sendJson(res, 403, { ok: false, error: 'Class admin role required.' })
          return null
        }
        return { supabase, user }
      }

      server.middlewares.use('/api/auth/create-account', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('allow', 'POST')
          res.end('Method not allowed')
          return
        }

        try {
          const supabase = createServiceClient()
          if (!supabase) {
            sendJson(res, 500, { ok: false, error: 'Supabase server configuration is missing.' })
            return
          }

          const payload = await readJsonBody(req)
          const email = String(payload.email || '').trim().toLowerCase()
          const password = String(payload.password || '')
          const username = String(payload.username || '').trim()

          if (!email || !password || !username) {
            sendJson(res, 400, { ok: false, error: 'Email, password, and username are required.' })
            return
          }

          const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              username,
              display_name: username,
            },
          })

          if (error) {
            const status = error.message.toLowerCase().includes('already') ? 409 : 400
            sendJson(res, status, { ok: false, error: error.message })
            return
          }

          sendJson(res, 200, { ok: true, userId: data.user?.id || null })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Could not create account.' })
        }
      })

      server.middlewares.use('/api/classes/departments', async (req, res) => {
        if (req.method !== 'POST' && req.method !== 'DELETE') {
          res.statusCode = 405
          res.setHeader('allow', 'POST, DELETE')
          res.end('Method not allowed')
          return
        }

        try {
          const payload = await readJsonBody(req)
          if (req.method === 'DELETE') {
            const departmentId = String(payload.departmentId || '').trim()
            if (!departmentId) {
              sendJson(res, 400, { ok: false, error: 'Department is required.' })
              return
            }
            const service = createServiceClient()
            if (!service) {
              sendJson(res, 500, { ok: false, error: 'Supabase server configuration is missing.' })
              return
            }
            const { data: department, error: departmentError } = await service
              .from('class_departments')
              .select('id,class_id,name')
              .eq('id', departmentId)
              .maybeSingle()
            if (departmentError || !department) {
              sendJson(res, 404, { ok: false, error: 'Agency was not found in this class.' })
              return
            }
            const manager = await getAuthorizedClassManager(req, res, String(department.class_id || ''))
            if (!manager) return
            const { error: deleteError } = await manager.supabase.from('class_departments').delete().eq('id', departmentId)
            if (deleteError) throw deleteError
            await manager.supabase.from('class_audit_events').insert({
              class_id: department.class_id,
              actor_user_id: manager.user.id,
              event_type: 'department_deleted',
              metadata: { departmentId, name: department.name },
            })
            sendJson(res, 200, { ok: true })
            return
          }

          const classId = String(payload.classId || '').trim()
          const name = String(payload.name || '').trim()
          if (!classId || !name) {
            sendJson(res, 400, { ok: false, error: 'Class and department name are required.' })
            return
          }
          const manager = await getAuthorizedClassManager(req, res, classId)
          if (!manager) return

          const { data: existingRows } = await manager.supabase
            .from('class_departments')
            .select('id,name')
            .eq('class_id', classId)
            .ilike('name', name)
            .limit(1)
          if (existingRows?.[0]?.id) {
            sendJson(res, 200, { ok: true, departmentId: existingRows[0].id })
            return
          }

          const { data: department, error: insertError } = await manager.supabase
            .from('class_departments')
            .insert({ class_id: classId, name })
            .select('id')
            .single()
          if (insertError) throw insertError

          await manager.supabase.from('class_audit_events').insert({
            class_id: classId,
            actor_user_id: manager.user.id,
            event_type: 'department_added',
            metadata: { departmentId: department.id, name },
          })

          sendJson(res, 200, { ok: true, departmentId: department.id })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Could not add class agency.' })
        }
      })

      server.middlewares.use('/api/classes/invites', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('allow', 'POST')
          res.end('Method not allowed')
          return
        }

        try {
          const payload = await readJsonBody(req)
          const classId = String(payload.classId || '').trim()
          if (!classId) {
            sendJson(res, 400, { ok: false, error: 'Class is required.' })
            return
          }
          const manager = await getAuthorizedClassManager(req, res, classId)
          if (!manager) return

          let code = ''
          for (let attempt = 0; attempt < 20; attempt += 1) {
            const candidate = createFiveDigitCode()
            const tokenHash = hashInviteCode(candidate)
            const { data: existing } = await manager.supabase
              .from('class_invites')
              .select('id')
              .eq('token_hash', tokenHash)
              .limit(1)
            if (existing?.length) continue
            const { error: insertError } = await manager.supabase.from('class_invites').insert({
              class_id: classId,
              token_hash: tokenHash,
              code_hint: candidate,
              role_granted: 'cadet',
              created_by: manager.user.id,
            })
            if (insertError) throw insertError
            await manager.supabase.from('class_audit_events').insert({
              class_id: classId,
              actor_user_id: manager.user.id,
              event_type: 'invite_created',
              metadata: { role: 'cadet', codeType: 'five_digit' },
            })
            code = candidate
            break
          }
          if (!code) {
            sendJson(res, 500, { ok: false, error: 'Could not create a unique class code.' })
            return
          }
          sendJson(res, 200, { ok: true, code })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Could not create class code.' })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
  plugins: [react(), localAuthApiPlugin()],
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['180.academy', 'test.180.academy', 'testt.180.academy', 'dev.180.academy', 'localhost', '127.0.0.1', '10.0.0.225', '10.0.0.42'],
    hmr: publicHmrHost
      ? {
          protocol: 'wss',
          host: publicHmrHost,
          clientPort: 443,
        }
      : undefined,
    watch: {
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 80,
      },
      ignored: ['**/.DS_Store', '**/.AppleDouble', '**/.LSOverride', '**/._*'],
    },
  },
}})
