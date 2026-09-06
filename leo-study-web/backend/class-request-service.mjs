const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateClassRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter your class details.')
  const clean = (name, max, required = false) => {
    const value = typeof input[name] === 'string' ? input[name].trim() : ''
    if ((required && value.length < 2) || value.length > max) throw new Error(`Enter a valid ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}.`)
    return value
  }
  const values = {
    academyName: clean('academyName', 160, true), academyCity: clean('academyCity', 120), academyState: clean('academyState', 80),
    className: clean('className', 120, true), requesterDepartment: clean('requesterDepartment', 160), requesterNote: clean('requesterNote', 2000),
    startDate: clean('startDate', 10, true), endDate: clean('endDate', 10, true),
  }
  for (const field of ['startDate', 'endDate']) {
    const value = values[field]
    const date = new Date(`${value}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Enter valid start and graduation dates.')
  }
  if (values.endDate < values.startDate) throw new Error('Graduation must be on or after the start date.')
  if (!Array.isArray(input.departments) || input.departments.length < 1 || input.departments.length > 100) throw new Error('Add between 1 and 100 departments.')
  const departments = [...new Map(input.departments.map((value) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 160) throw new Error('Enter valid department names.')
    return [value.trim().toLowerCase(), value.trim()]
  })).values()]
  if (values.requesterDepartment && !departments.some((value) => value.toLowerCase() === values.requesterDepartment.toLowerCase())) throw new Error('Choose your department from the class department list.')
  return { ...values, departments }
}

export function createClassRequestService({ supabase, userClient }) {
  return async ({ token, action, payload }) => {
    if (!token) return { status: 401, body: { error: 'Sign in to continue.' } }
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return { status: 401, body: { error: 'Your session expired. Sign in again.' } }
    const user = data.user
    let rpcName
    let args
    if (action === 'submit') {
      try { args = { p_payload: validateClassRequest(payload) } }
      catch (validationError) { return { status: 400, body: { error: validationError.message } } }
      rpcName = 'request_class_creation'
    } else {
      if (!uuidPattern.test(String(payload?.requestId || ''))) return { status: 400, body: { error: 'Choose a valid class request.' } }
      const { data: roles, error: roleError } = await supabase.from('user_roles').select('user_id').eq('user_id', user.id).eq('role', 'owner').limit(1)
      if (roleError || !roles?.length) return { status: 403, body: { error: 'Owner role required.' } }
      if (action !== 'approve' && action !== 'reject') return { status: 404, body: { error: 'Action not found.' } }
      rpcName = action === 'approve' ? 'owner_approve_class_creation_request' : 'owner_reject_class_creation_request'
      args = { p_request_id: payload.requestId, ...(action === 'reject' ? { p_reason: String(payload.reason || '').slice(0, 2000) } : {}) }
    }
    // Call as the verified user so the database independently enforces ownership.
    const { data: result, error: rpcError } = await userClient(token).rpc(rpcName, args)
    if (rpcError) {
      if (rpcError.code === 'P0001') return { status: 400, body: { error: rpcError.message } }
      if (rpcError.code === '23505') return { status: 409, body: { error: 'This class already exists. Refresh the class list or contact the owner.' } }
      return { status: 503, body: { error: 'Class requests are temporarily unavailable. Please try again in a moment.' } }
    }
    return { status: 200, body: { ok: true, ...(action === 'submit' ? { requestId: result } : result || {}), notification: 'queued' } }
  }
}
