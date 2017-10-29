// Be sure to add these ENV variables!
const {
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_PLAN_ID,
  KEYGEN_PRODUCT_TOKEN,
  KEYGEN_ACCOUNT_ID,
  KEYGEN_POLICY_ID,
  PORT = 8080
} = process.env

const stripe = require("stripe")(STRIPE_SECRET_KEY)
const fetch = require("node-fetch")
const express = require("express")
const bodyParser = require("body-parser")
const morgan = require('morgan')
const app = express()

app.use(bodyParser.json({ type: "application/vnd.api+json" }))
app.use(bodyParser.json({ type: "application/json" }))
app.use(morgan('combined'))

app.set('view engine', 'ejs')

app.post("/keygen-webhooks", async (req, res) => {
  const { data: { id: keygenEventId } } = req.body

  // Fetch the webhook to validate it and get its most up-to-date state
  const keygenWebhook = await fetch(`https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/webhook-events/${keygenEventId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
      "Accept": "application/vnd.api+json"
    }
  })

  const { data: keygenEvent, errors } = await keygenWebhook.json()
  if (errors) {
    return res.sendStatus(200) // Event does not exist (wasn't sent from Keygen)
  }

  switch (keygenEvent.attributes.event) {
    // 1. Respond to user creation events within your Keygen account. Here, we'll create
    //    a new Stripe customer account for new Keygen users.
    case "user.created":
      const { data: keygenUser } = JSON.parse(keygenEvent.attributes.payload)

      // Make sure our Keygen user has a Stripe token, or else we can't charge them later on..
      if (!keygenUser.attributes.metadata.stripeToken) {
        throw new Error(`User ${keygenUser.id} does not have a Stripe token attached to their user account!`)
      }

      // 2. Create a Stripe customer, making sure we use our Stripe token as their payment
      //    method of choice.
      const stripeCustomer = await stripe.customers.create({
        description: `Customer for Keygen user ${keygenUser.attributes.email}`,
        email: keygenUser.attributes.email,
        // Source is a Stripe token obtained with Stripe.js during user creation and
        // temporarily stored in the user's metadata attribute.
        source: keygenUser.attributes.metadata.stripeToken,
        // Store the user's Keygen ID within the Stripe customer so that we can lookup
        // a Stripe customer's Keygen account.
        metadata: { keygenUserId: keygenUser.id }
      })

      // 3. Add the user's Stripe customer ID to the user's metadata attribute so that
      //    we can lookup their Stripe customer account when needed.
      const update = await fetch(`https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/users/${keygenUser.id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
          "Content-Type": "application/vnd.api+json",
          "Accept": "application/vnd.api+json"
        },
        body: JSON.stringify({
          data: {
            type: "users",
            attributes: {
              metadata: { stripeCustomerId: stripeCustomer.id }
            }
          }
        })
      })

      const { data, errors } = await update.json()
      if (errors) {
        throw new Error(errors.map(e => e.detail).toString())
      }

      // All is good! Stripe customer was successfully created for the new Keygen
      // user. Let Keygen know the event was received successfully.
      res.sendStatus(200)
      break
    default:
      // For events we don't care about, let Keygen know all is good.
      res.sendStatus(200)
  }
})

app.post("/stripe-webhooks", async (req, res) => {
  const { body: stripeEvent } = req

  switch (stripeEvent.type) {
    // 4. Respond to customer creation events within your Stripe account. Here, we'll
    //    create a new Stripe subscription for the customer as well as a Keygen license
    //    for the Keygen user that belongs to the Stripe customer.
    case "customer.created":
      const { object: stripeCustomer } = stripeEvent.data

      // Make sure our Stripe customer has a Keygen user ID, or else we can't work with it.
      if (!stripeCustomer.metadata.keygenUserId) {
        throw new Error(`Customer ${stripeCustomer.id} does not have a Keygen user ID attached to their customer account!`)
      }

      // 5. Create a subscription for the new Stripe customer. This will charge the
      //    Stripe customer. (You may or may not want to also check if the customer
      //    already has an existing subscription.)
      const stripeSubscription = await stripe.subscriptions.create({
        customer: stripeCustomer.id,
        plan: STRIPE_PLAN_ID
      }, {
        // Use an idempotency key so that we don't charge a customer more than one
        // time regardless of how many times this webhook is retried.
        // See: https://stripe.com/docs/api/node#idempotent_requests
        idempotency_key: keygenUserId
      })

      // 6. Create a license for the new Stripe customer after we create a subscription
      //    for them. We're pulling the Keygen user's ID from the Stripe customer's
      //    metadata attribute (we stored it there earler).
      const keygenLicense = await fetch(`https://api.keygen.sh/v1/accounts/${KEYGEN_ACCOUNT_ID}/licenses`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${KEYGEN_PRODUCT_TOKEN}`,
          "Content-Type": "application/vnd.api+json",
          "Accept": "application/vnd.api+json"
        },
        body: JSON.stringify({
          data: {
            type: "licenses",
            attributes: {
              metadata: { stripeSubscriptionId: stripeSubscription.id }
            },
            relationships: {
              policy: {
                data: { type: "policies", id: KEYGEN_POLICY_ID }
              },
              user: {
                data: { type: "users", id: stripeCustomer.metadata.keygenUserId }
              }
            }
          }
        })
      })

      const { data, errors } = await keygenLicense.json()
      if (errors) {
        res.sendStatus(500)

        // If you receive an error here, then you may want to handle the fact the customer
        // may have been charged for a license that they didn't receive e.g. easiest way
        // would be to create it manually, or refund their subscription charge.
        throw new Error(errors.map(e => e.detail).toString())
      }

      // All is good! License was successfully created for the new Stripe customer's
      // Keygen user account. Next up would be for us to email the license key to
      // our user's email using `stripeCustomer.email` or something similar.

      // Let Stripe know the event was received successfully.
      res.sendStatus(200)
      break
    default:
      // For events we don't care about, let Stripe know all is good.
      res.sendStatus(200)
  }
})

app.get('/', async (req, res) => {
  res.render('index', {
    STRIPE_PUBLISHABLE_KEY,
    KEYGEN_ACCOUNT_ID
  })
})

process.on('unhandledRejection', err => {
  console.error(`Unhandled rejection: ${err}`, err.stack)
})

const server = app.listen(PORT, 'localhost', () => {
  const { address, port } = server.address()

  console.log(`Listening at http://${address}:${port}`)
})