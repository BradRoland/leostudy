import assert from 'node:assert/strict'
import test from 'node:test'
import { createTierResolver } from './stripe-tier-service.mjs'

test('resolves tier from Payment Link id before fetching line items', async () => {
  const resolver = createTierResolver({
    paymentLinkToTier: new Map([['plink_tier5', 'tier5']]),
    retrieveSession: async () => {
      throw new Error('line items should not be fetched when payment link maps directly')
    },
  })

  const tier = await resolver.resolveTierFromSession({
    id: 'cs_test_123',
    payment_link: 'plink_tier5',
  })

  assert.equal(tier, 'tier5')
})

test('resolves tier from expanded checkout line item price id', async () => {
  const resolver = createTierResolver({
    priceToTier: new Map([['price_tier10', 'tier10']]),
    retrieveSession: async () => ({
      line_items: {
        data: [
          {
            price: { id: 'price_tier10', unit_amount: 1000 },
            amount_subtotal: 1000,
          },
        ],
      },
    }),
  })

  const tier = await resolver.resolveTierFromSession({
    id: 'cs_test_456',
  })

  assert.equal(tier, 'tier10')
})
