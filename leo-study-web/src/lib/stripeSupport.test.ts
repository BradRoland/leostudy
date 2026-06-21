import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSupportCheckoutUrl } from './stripeSupport.ts'

test('builds a Stripe Payment Link URL with user reconciliation parameters', () => {
  const url = buildSupportCheckoutUrl({
    checkoutUrl: 'https://buy.stripe.com/test_123?locale=auto',
    currentUserEmail: 'student@example.com',
    currentUserId: 'user_123-abc',
  })

  assert.equal(url.toString(), 'https://buy.stripe.com/test_123?locale=auto&prefilled_email=student%40example.com&client_reference_id=user_123-abc')
})

test('omits blank Stripe Payment Link reconciliation parameters', () => {
  const url = buildSupportCheckoutUrl({
    checkoutUrl: 'https://buy.stripe.com/test_123',
    currentUserEmail: '   ',
    currentUserId: '',
  })

  assert.equal(url.toString(), 'https://buy.stripe.com/test_123')
})
