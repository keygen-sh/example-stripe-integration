# Example Keygen + Stripe integration
The following web app is written in Node.js and shows how to integrate
[Keygen](https://keygen.sh) and [Stripe](https://stripe.com) together
using webhooks. Much more could be done to automate e.g. license
revocation when a subscription is canceled, etc.

> **This example application is not 100% production-ready**, but it should
> get you 90% of the way there. You may need to add additional logging,
> error handling, as well as listening for additional webhook events.

## Running the app

First up, configure a few environment variables:
```bash
# Stripe publishable key
export STRIPE_PUBLISHABLE_KEY="YOUR_STRIPE_PUBLISHABLE_KEY"

# Stripe secret key (don't share this!)
export STRIPE_SECRET_KEY="YOUR_STRIPE_SECRET_KEY"

# The Stripe plan to subscribe new customers to
export STRIPE_PLAN_ID="YOUR_STRIPE_PLAN_ID"

# Keygen product token (don't share this!)
export KEYGEN_PRODUCT_TOKEN="YOUR_KEYGEN_PRODUCT_TOKEN"

# Your Keygen account ID
export KEYGEN_ACCOUNT_ID="YOUR_KEYGEN_ACCOUNT_ID"

# The Keygen policy to use when creating licenses for new users
# after they successfully subscribe to a plan
export KEYGEN_POLICY_ID="YOUR_KEYGEN_POLICY_ID"
```

You can either run each line above within your terminal session before
starting the app, or you can add the above contents to your `~/.bashrc`
file and then run `source ~/.bashrc` after saving the file.

Next, install dependencies with [`yarn`](https://yarnpkg.comg):
```
yarn
```

Then start the app:
```
yarn start
```

## Testing webhooks locally

For local development, create an [`ngrok`](https://ngrok.com) tunnel:
```
ngrok http 8080
```

## Testing webhook URLs

Next up, add the secure `ngrok` URL to your Stripe and Keygen accounts to
listen for webhooks.

1. **Stripe:** add `https://{YOUR_NGROK_URL}/stripe-webhooks` to https://dashboard.stripe.com/account/webhooks
1. **Keygen:** add `https://{YOUR_NGROK_URL}/keygen-webhooks` to https://app.keygen.sh/webhook-endpoints

## Testing the integration

Visit the following url: http://localhost:8080 and fill out the purchase form.

## Questions?

Reach out at [support@keygen.sh](mailto:support@keygen.sh) if you have any
questions or concerns!
