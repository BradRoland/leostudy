export const rolandUserId = '90f1b543-e768-4d48-95da-bec61dd9a193'
const fail = (status,message) => Object.assign(new Error(message),{status})
export function rolandTestingEnabled(env) {
 return env.DISABLE_LIVE_INTEGRATIONS === 'true' && (
  (env.CLASS_REQUEST_APP_URL === 'https://dev.180.academy' && env.SUPABASE_URL === 'http://gateway') ||
  (['http://127.0.0.1:5176','https://dev.180.academy'].includes(env.CLASS_REQUEST_APP_URL) && env.SUPABASE_URL === 'http://127.0.0.1:55431')
 )
}
export function createRolandMembershipTest({supabase,env=process.env}) {
 const check = r => {if(r.error)throw r.error;return r.data}
 async function authorize(userId) {
  if(!rolandTestingEnabled(env))throw fail(404,'Not found')
  if(userId!==rolandUserId)throw fail(403,'This testing section is only available to Roland.')
  const roles=check(await supabase.from('user_roles').select('role').eq('user_id',userId).eq('role','owner'))
  if(!roles.length)throw fail(403,'Owner access required.')
 }
 async function read(userId) {
  await authorize(userId)
  const row=check(await supabase.from('academy_subscriptions').select('paid_tier,paid_through').eq('subscription_id',`academy_test_${userId}`).eq('user_id',userId).eq('status','development_test').maybeSingle())
  return {tier:row&&Date.parse(row.paid_through)>Date.now()?row.paid_tier:'free',expiresAt:row?.paid_through||null}
 }
 return {read, async set(userId,tier) {
  await authorize(userId)
  if(!['free','tier5','tier10'].includes(tier))throw fail(400,'Choose Free, Plus or Pro.')
  check(await supabase.rpc('set_roland_test_membership',{p_user:userId,p_tier:tier}))
  return read(userId)
 }}
}
