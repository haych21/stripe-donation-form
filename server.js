require("dotenv").config();

console.log(
  "Stripe key loaded:",
  !!process.env.STRIPE_SECRET_KEY
);

const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(
  process.env.STRIPE_SECRET_KEY
);

const app = express();

/* =========================================================
   CORS
   ========================================================= */

app.use(cors());

/* =========================================================
   STRIPE WEBHOOK
   IMPORTANT:
   This MUST come before express.json()
   ========================================================= */

app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    const signature =
      req.headers["stripe-signature"];

    let event;

    try {

      event =
        stripe.webhooks.constructEvent(
          req.body,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET
        );

    } catch (err) {

      console.error(
        "Webhook signature verification failed:",
        err.message
      );

      return res
        .status(400)
        .send(
          `Webhook Error: ${err.message}`
        );
    }

    console.log(
      "================================"
    );

    console.log(
      "WEBHOOK RECEIVED"
    );

    console.log(
      "Event type:",
      event.type
    );

    console.log(
      "Event ID:",
      event.id
    );

    console.log(
      "================================"
    );

    try {

      /* =====================================================
         CHECKOUT SESSION COMPLETED

         This is used for the Bacs setup Checkout.
         Stripe has collected the mandate/bank details.
         We then retrieve the SetupIntent and create
         the recurring subscription.
         ===================================================== */

      if (
        event.type ===
        "checkout.session.completed"
      ) {

        const session =
          event.data.object;

        console.log(
          "Bacs Checkout completed:",
          session.id
        );

        console.log(
          "Checkout mode:",
          session.mode
        );

        console.log(
          "Customer:",
          session.customer
        );

        console.log(
          "SetupIntent:",
          session.setup_intent
        );

        /*
         * Only process our Bacs setup sessions.
         */

        if (
          session.mode !== "setup"
        ) {

          console.log(
            "Not a setup-mode Checkout session."
          );

        } else {

          const metadata =
            session.metadata || {};

          /*
           * Make sure this is one of our
           * monthly Bacs donation sessions.
           */

          if (
            metadata.donationType !==
            "monthly_bacs"
          ) {

            console.log(
              "Not a monthly Bacs donation."
            );

          } else {

            const customerId =
              session.customer;

            const setupIntentId =
              session.setup_intent;

            const priceId =
              metadata.priceId;

            const billingDay =
              Number(
                metadata.billingDay
              );

            if (!customerId) {

              throw new Error(
                "Bacs Checkout session has no customer."
              );

            }

            if (!setupIntentId) {

              throw new Error(
                "Bacs Checkout session has no SetupIntent."
              );

            }

            if (!priceId) {

              throw new Error(
                "Bacs Checkout session has no price ID."
              );

            }

            if (
              ![1, 15, 26].includes(
                billingDay
              )
            ) {

              throw new Error(
                "Invalid Bacs billing day."
              );

            }

            /* =================================================
               RETRIEVE SETUP INTENT
               ================================================= */

            const setupIntent =
              await stripe.setupIntents.retrieve(
                setupIntentId
              );

            console.log(
              "Bacs SetupIntent status:",
              setupIntent.status
            );

            if (
              setupIntent.status !==
              "succeeded"
            ) {

              throw new Error(
                `Bacs SetupIntent is not succeeded. Status: ${setupIntent.status}`
              );

            }

            if (
              !setupIntent.payment_method
            ) {

              throw new Error(
                "Bacs SetupIntent has no payment method."
              );

            }

            const paymentMethodId =
              setupIntent.payment_method;

            /*
             * Retrieve the PaymentMethod so we
             * can verify it really is Bacs.
             */

            const paymentMethod =
              await stripe.paymentMethods.retrieve(
                paymentMethodId
              );

            console.log(
              "Payment method type:",
              paymentMethod.type
            );

            if (
              paymentMethod.type !==
              "bacs_debit"
            ) {

              throw new Error(
                "Payment method is not a Bacs Direct Debit payment method."
              );

            }

            /* =================================================
               PREVENT DUPLICATE SUBSCRIPTIONS

               Stripe can retry webhook events.
               Before creating another subscription,
               check whether this SetupIntent has already
               been used.
               ================================================= */

            const existingSubscriptions =
              await stripe.subscriptions.list({
                customer: customerId,
                status: "all",
                limit: 100
              });

            const existingSubscription =
              existingSubscriptions.data.find(
                subscription =>
                  subscription.metadata &&
                  subscription.metadata
                    .bacsSetupIntentId ===
                    setupIntentId
              );

            if (
              existingSubscription
            ) {

              console.log(
                "Bacs subscription already exists:",
                existingSubscription.id
              );

            } else {

              /* ===============================================
                 CREATE MONTHLY BACS SUBSCRIPTION
                 =============================================== */

              console.log(
                "Creating monthly Bacs subscription..."
              );

              const subscription =
                await stripe.subscriptions.create({

                  customer:
                    customerId,

                  items: [
                    {
                      price:
                        priceId
                    }
                  ],

                  default_payment_method:
                    paymentMethodId,

                  billing_cycle_anchor_config: {
                    day_of_month:
                      billingDay
                  },

                  proration_behavior:
                    "none",

                  payment_settings: {

                    payment_method_types: [
                      "bacs_debit"
                    ],

                    save_default_payment_method:
                      "on_subscription"

                  },

                  metadata: {

                    donationType:
                      "monthly_bacs",

                    donationCause:
                      metadata.donationCause ||
                      "",

                    donationAmount:
                      metadata.donationAmount ||
                      "",

                    billingDay:
                      String(
                        billingDay
                      ),

                    giftAid:
                      metadata.giftAid ||
                      "no",

                    bacsSetupIntentId:
                      setupIntentId,

                    checkoutSessionId:
                      session.id

                  }

                });

              console.log(
                "================================"
              );

              console.log(
                "BACS SUBSCRIPTION CREATED"
              );

              console.log(
                "Subscription:",
                subscription.id
              );

              console.log(
                "Status:",
                subscription.status
              );

              console.log(
                "================================"
              );

            }

          }

        }

      }

      /* =====================================================
         NORMAL CARD / SUBSCRIPTION WEBHOOKS
         ===================================================== */

      switch (event.type) {

        case "invoice.paid":

          console.log(
            "Monthly payment successful"
          );

          break;

        case "invoice.payment_failed":

          console.log(
            "Monthly payment failed"
          );

          break;

        case "customer.subscription.created":

          console.log(
            "Subscription created"
          );

          break;

        case "customer.subscription.updated":

          console.log(
            "Subscription updated"
          );

          break;

        case "customer.subscription.deleted":

          console.log(
            "Subscription cancelled"
          );

          break;

        case "setup_intent.succeeded":

          console.log(
            "Payment method successfully saved"
          );

          break;

        case "checkout.session.completed":

          /*
           * Already handled above.
           */

          break;

        default:

          console.log(
            "Unhandled event type:",
            event.type
          );

      }

      /*
       * Tell Stripe the webhook was successfully processed.
       */

      return res.json({
        received: true
      });

    } catch (err) {

      console.error(
        "WEBHOOK PROCESSING ERROR:",
        err
      );

      /*
       * Return 500 so Stripe can retry the webhook.
       */

      return res
        .status(500)
        .json({
          received: false,
          error: err.message
        });

    }

  }
);

/* =========================================================
   NORMAL JSON ROUTES
   ========================================================= */

app.use(
  express.json()
);

app.use(
  express.static("public")
);

/* =========================================================
   GET ACTIVE DONATION PRODUCTS + MONTHLY PRICES

   Stripe is the source of truth for:
   - Product names
   - Active/inactive products
   - Donation amounts
   - Price IDs
   - Monthly recurring prices
   ========================================================= */

app.get(
  "/donation-options",
  async (req, res) => {

    try {

      const prices =
        await stripe.prices.list({

          active: true,

          currency: "gbp",

          type: "recurring",

          limit: 100,

          expand: [
            "data.product"
          ]

        });

      const products = {};

      prices.data.forEach(price => {

        const product =
          price.product;

        if (
          !product ||
          typeof product === "string"
        ) {

          return;

        }

        if (
          !product.active
        ) {

          return;

        }

        if (
          !price.recurring ||
          price.recurring.interval !== "month" ||
          price.recurring.interval_count !== 1
        ) {

          return;

        }

        if (
          !products[product.id]
        ) {

          products[product.id] = {

            id:
              product.id,

            name:
              product.name,

            prices: []

          };

        }

        products[product.id].prices.push({

          id:
            price.id,

          amount:
            price.unit_amount,

          currency:
            price.currency,

          interval:
            price.recurring.interval

        });

      });

      const productList =
        Object.values(
          products
        );

      productList.forEach(product => {

        product.prices.sort(
          (a, b) =>
            a.amount - b.amount
        );

      });

      const filteredProducts =
        productList.filter(
          product =>
            product.prices.length > 0
        );

      console.log(
        "Donation options loaded from Stripe:"
      );

      console.log(
        JSON.stringify(
          filteredProducts,
          null,
          2
        )
      );

      return res.json({

        products:
          filteredProducts

      });

    } catch (err) {

      console.error(
        "DONATION OPTIONS ERROR:",
        err
      );

      return res
        .status(500)
        .json({

          error:
            "Could not load donation options."

        });

    }

  }
);

/* =========================================================
   CREATE MONTHLY DONATION PAYMENT SETUP
   CARD FLOW
   ========================================================= */

app.post(
  "/create-subscription",
  async (req, res) => {

    try {

      const {
        email,
        priceId,
        giftAid,
        fullName,
        phone,
        country,
        donationAmount,
        startDate,
        donationCause
      } = req.body;

      console.log(
        "================================"
      );

      console.log(
        "NEW MONTHLY DONATION"
      );

      console.log(
        "Email:",
        email
      );

      console.log(
        "Amount:",
        donationAmount
      );

      console.log(
        "Start date:",
        startDate
      );

      console.log(
        "Cause:",
        donationCause
      );

      console.log(
        "================================"
      );

      /* =====================================================
         CREATE CUSTOMER
         ===================================================== */

      const customer =
        await stripe.customers.create({

          email,

          name:
            fullName,

          phone,

          address: {
            country
          },

          metadata: {

            giftAid:
              giftAid
                ? "yes"
                : "no",

            donationCause:
              donationCause || ""

          }

        });

      console.log(
        "Customer created:",
        customer.id
      );

      /* =====================================================
         VALIDATE BILLING DAY
         ===================================================== */

      const billingDay =
        Number(startDate);

      if (
        ![1, 15, 26].includes(
          billingDay
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "Invalid start date"
          });

      }

      /* =====================================================
         VALIDATE PRICE
         ===================================================== */

      if (!priceId) {

        return res
          .status(400)
          .json({
            error:
              "Missing monthly price ID"
          });

      }

      /* =====================================================
         CREATE SETUP INTENT
         ===================================================== */

      const setupIntent =
        await stripe.setupIntents.create({

          customer:
            customer.id,

          automatic_payment_methods: {
            enabled: true
          },

          metadata: {

            donationType:
              "monthly",

            donationAmount:
              String(
                donationAmount
              ),

            billingDay:
              String(
                billingDay
              ),

            giftAid:
              giftAid
                ? "yes"
                : "no",

            priceId

          }

        });

      console.log(
        "SetupIntent created:",
        setupIntent.id
      );

      return res.json({

        mode:
          "setup",

        setupClientSecret:
          setupIntent.client_secret,

        setupIntentId:
          setupIntent.id,

        customerId:
          customer.id,

        priceId,

        billingDay

      });

    } catch (err) {

      console.error(
        "PAYMENT ERROR:",
        err
      );

      return res
        .status(500)
        .json({
          error:
            err.message
        });

    }

  }
);

/* =========================================================
   CREATE MONTHLY CARD SUBSCRIPTION
   ========================================================= */

app.post(
  "/create-monthly-subscription",
  async (req, res) => {

    try {

      const {
        customerId,
        setupIntentId,
        priceId,
        billingDay
      } = req.body;

      console.log(
        "================================"
      );

      console.log(
        "CREATING MONTHLY SUBSCRIPTION"
      );

      console.log(
        "Customer:",
        customerId
      );

      console.log(
        "SetupIntent:",
        setupIntentId
      );

      console.log(
        "Price:",
        priceId
      );

      console.log(
        "Billing day:",
        billingDay
      );

      console.log(
        "================================"
      );

      /* =====================================================
         VALIDATE BILLING DAY
         ===================================================== */

      const validBillingDays =
        [1, 15, 26];

      if (
        !validBillingDays.includes(
          Number(billingDay)
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "Invalid billing day"
          });

      }

      /* =====================================================
         RETRIEVE SETUP INTENT
         ===================================================== */

      const setupIntent =
        await stripe.setupIntents.retrieve(
          setupIntentId
        );

      if (
        setupIntent.status !==
        "succeeded"
      ) {

        return res
          .status(400)
          .json({
            error:
              "Payment method has not been successfully saved."
          });

      }

      if (
        !setupIntent.payment_method
      ) {

        return res
          .status(400)
          .json({
            error:
              "No payment method was found on the SetupIntent."
          });

      }

      if (
        setupIntent.customer !==
        customerId
      ) {

        return res
          .status(400)
          .json({
            error:
              "SetupIntent does not belong to this customer."
          });

      }

      const paymentMethodId =
        setupIntent.payment_method;

      console.log(
        "Saved payment method:",
        paymentMethodId
      );

      /* =====================================================
         CREATE CARD SUBSCRIPTION
         ===================================================== */

      const subscription =
        await stripe.subscriptions.create({

          customer:
            customerId,

          items: [
            {
              price:
                priceId
            }
          ],

          default_payment_method:
            paymentMethodId,

          billing_cycle_anchor_config: {

            day_of_month:
              Number(
                billingDay
              )

          },

          proration_behavior:
            "none",

          payment_settings: {

            payment_method_types: [
              "card"
            ],

            save_default_payment_method:
              "on_subscription"

          },

          metadata: {

            donationType:
              "monthly",

            billingDay:
              String(
                billingDay
              )

          }

        });

      console.log(
        "Monthly subscription created:",
        subscription.id
      );

      console.log(
        "Subscription status:",
        subscription.status
      );

      return res.json({

        success:
          true,

        subscriptionId:
          subscription.id,

        status:
          subscription.status

      });

    } catch (err) {

      console.error(
        "MONTHLY SUBSCRIPTION ERROR:",
        err
      );

      return res
        .status(500)
        .json({
          error:
            err.message
        });

    }

  }
);

/* =========================================================
   CREATE BACS CHECKOUT SESSION
   ========================================================= */

app.post(
  "/create-bacs-checkout-session",
  async (req, res) => {

    try {

      const {
        email,
        fullName,
        phone,
        address,
        postcode,
        country,
        giftAid,
        donationAmount,
        startDate,
        donationCause,
        priceId
      } = req.body;

      console.log(
        "================================"
      );

      console.log(
        "NEW BACS DONATION"
      );

      console.log(
        "Email:",
        email
      );

      console.log(
        "Name:",
        fullName
      );

      console.log(
        "Amount:",
        donationAmount
      );

      console.log(
        "Start date:",
        startDate
      );

      console.log(
        "Cause:",
        donationCause
      );

      console.log(
        "================================"
      );

      /* =====================================================
         VALIDATE BILLING DAY
         ===================================================== */

      const billingDay =
        Number(startDate);

      if (
        ![1, 15, 26].includes(
          billingDay
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "Invalid start date"
          });

      }

      /* =====================================================
         VALIDATE PRICE
         ===================================================== */

      if (!priceId) {

        return res
          .status(400)
          .json({
            error:
              "Missing monthly price ID"
          });

      }

      /* =====================================================
         NORMALISE COUNTRY
         ===================================================== */

      let stripeCountry =
        String(
          country || ""
        )
          .trim()
          .toUpperCase();

      if (
        stripeCountry ===
        "UNITED KINGDOM"
      ) {

        stripeCountry =
          "GB";

      }

      if (
        stripeCountry ===
        "UK"
      ) {

        stripeCountry =
          "GB";

      }

      if (
        stripeCountry !==
        "GB"
      ) {

        return res
          .status(400)
          .json({
            error:
              "Bacs Direct Debit is currently available only for customers in the United Kingdom."
          });

      }

      /* =====================================================
         CREATE CUSTOMER
         ===================================================== */

      const customer =
        await stripe.customers.create({

          email,

          name:
            fullName,

          phone,

          address: {

            line1:
              address,

            postal_code:
              postcode,

            country:
              "GB"

          },

          metadata: {

            donationType:
              "monthly_bacs",

            donationCause:
              donationCause || "",

            donationAmount:
              String(
                donationAmount || ""
              ),

            billingDay:
              String(
                billingDay
              ),

            giftAid:
              giftAid
                ? "yes"
                : "no"

          }

        });

      console.log(
        "Bacs customer created:",
        customer.id
      );

      /* =====================================================
         CREATE STRIPE CHECKOUT SESSION
         ===================================================== */

      const session =
        await stripe.checkout.sessions.create({

          mode:
            "setup",

          customer:
            customer.id,

          currency:
            "gbp",

          allowed_payment_method_types: [
            "bacs_debit"
          ],

          billing_address_collection:
            "required",

          customer_update: {

            name:
              "auto",

            address:
              "auto"

          },

          setup_intent_data: {

            metadata: {

              donationType:
                "monthly_bacs",

              donationAmount:
                String(
                  donationAmount || ""
                ),

              donationCause:
                donationCause || "",

              billingDay:
                String(
                  billingDay
                ),

              giftAid:
                giftAid
                  ? "yes"
                  : "no",

              priceId,

              customerId:
                customer.id

            }

          },

          metadata: {

            donationType:
              "monthly_bacs",

            donationAmount:
              String(
                donationAmount || ""
              ),

            donationCause:
              donationCause || "",

            billingDay:
              String(
                billingDay
              ),

            giftAid:
              giftAid
                ? "yes"
                : "no",

            priceId,

            customerId:
              customer.id

          },

          /* =================================================
             BACS SUCCESS REDIRECT

             Stripe sends the staff member back to the
             donation form after successful Bacs setup.
             ================================================= */

          success_url:
            `${req.protocol}://${req.get(
              "host"
            )}/`,

          cancel_url:
            `${req.protocol}://${req.get(
              "host"
            )}/bacs-cancelled`

        });

      console.log(
        "Bacs Checkout session created:",
        session.id
      );

      /* =====================================================
         SEND CHECKOUT URL BACK TO FRONTEND
         ===================================================== */

      return res.json({

        success:
          true,

        url:
          session.url,

        sessionId:
          session.id

      });

    } catch (err) {

      console.error(
        "BACS CHECKOUT ERROR:",
        err
      );

      return res
        .status(500)
        .json({
          error:
            err.message
        });

    }

  }
);

/* =========================================================
   BACS SUCCESS PAGE

   Kept as a fallback route.
   The normal successful Bacs flow now redirects
   directly to "/".
   ========================================================= */

app.get(
  "/bacs-success",
  (req, res) => {

    res.redirect("/");

  }
);

/* =========================================================
   BACS CANCELLED PAGE
   ========================================================= */

app.get(
  "/bacs-cancelled",
  (req, res) => {

    res.send(`

      <!DOCTYPE html>

      <html lang="en">

      <head>

        <meta charset="UTF-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <title>
          Payment Cancelled
        </title>

        <style>

          body {

            margin: 0;

            min-height: 100vh;

            display: flex;

            align-items: center;

            justify-content: center;

            background: #f8f8f6;

            font-family:
              Arial,
              sans-serif;

          }

          .card {

            width: min(
              90%,
              520px
            );

            padding: 40px;

            background: white;

            border-radius: 20px;

            text-align: center;

            box-shadow:
              0 10px 30px
              rgba(0,0,0,0.08);

          }

          h1 {

            margin-bottom: 15px;

          }

          p {

            line-height: 1.6;

            color: #666;

          }

        </style>

      </head>

      <body>

        <div class="card">

          <h1>
            Donation cancelled
          </h1>

          <p>
            Your Bacs Direct Debit setup
            was cancelled.
          </p>

          <p>
            No monthly donation was created.
          </p>

        </div>

      </body>

      </html>

    `);

  }
);

/* =========================================================
   START SERVER
   ========================================================= */

app.listen(
  process.env.PORT || 3000,
  () => {

    console.log(
      `Server running on port ${
        process.env.PORT || 3000
      }`
    );

  }
);