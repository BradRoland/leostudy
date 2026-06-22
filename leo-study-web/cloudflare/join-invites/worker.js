const mainAppOrigin = 'https://180.academy'
const inviteCodePattern = /^[A-Z0-9][A-Z0-9-]{2,38}[A-Z0-9]$/

function normalizeInviteCode(value) {
  const compact = String(value || '').trim().replace(/\s+/g, '').toUpperCase()
  if (!compact || compact.includes('/') || compact.includes('\\') || compact.includes('?') || compact.includes('#')) return ''
  return inviteCodePattern.test(compact) ? compact : ''
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const rawPath = decodeURIComponent(url.pathname || '/').replace(/^\/+|\/+$/g, '')

    if (!rawPath) {
      return Response.redirect(`${mainAppOrigin}/classes/join`, 302)
    }

    const code = normalizeInviteCode(rawPath.split('/')[0] || '')
    if (!code) {
      return new Response('Invalid invite code', { status: 400 })
    }

    const target = new URL(`/invite/${code}`, mainAppOrigin)
    target.search = url.search
    return Response.redirect(target.toString(), 302)
  },
}
