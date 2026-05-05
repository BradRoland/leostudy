export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET')
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }

  res.status(200).json({ ok: true })
}
