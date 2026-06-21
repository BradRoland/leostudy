type BuildSupportCheckoutUrlOptions = {
  checkoutUrl: string
  currentUserEmail?: string
  currentUserId?: string
}

export function buildSupportCheckoutUrl({ checkoutUrl, currentUserEmail = '', currentUserId = '' }: BuildSupportCheckoutUrlOptions) {
  const url = new URL(checkoutUrl)
  const email = currentUserEmail.trim()
  const userId = currentUserId.trim()

  if (email) url.searchParams.set('prefilled_email', email)
  if (userId) url.searchParams.set('client_reference_id', userId)

  return url
}
