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
   CREATE BACS SUBSCRIPTION FROM SETUP INTENT
   ========================================================= */

async function createBacsSubscriptionFromSetup(
  setupIntentId,
  fallbackMetadata = {}
) {

  console.log(
    "Processing Bacs SetupIntent:",
    setupIntentId
  );

  /* =======================================================
     RETRIEVE SETUP INTENT
     ======================================================= */

  const setupIntent =
    await stripe.setupIntents.retrieve(
      setupIntentId
    );

  console.log(
    "Bacs SetupIntent status:",
    setupIntent.status
  );

  /*
   * Do not create the subscription until
   * the SetupIntent has actually succeeded.
   */

  if (
    setupIntent.status !==
    "succeeded"
  ) {

    console.log(
      "Bacs SetupIntent is not ready yet. Waiting for Stripe."
    );

    return {
      created: false,
      pending: true,
      reason:
        `SetupIntent status is ${setupIntent.status}`
    };

  }

  /* =======================================================
     PAYMENT METHOD
     ======================================================= */

  if (
    !setupIntent.payment_method
  ) {

    throw new Error(
      "Bacs SetupIntent has no payment method."
    );

  }

  const paymentMethodId =
    typeof setupIntent.payment_method ===
      "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method.id;

  const paymentMethod =
    await stripe.paymentMethods.retrieve(
      paymentMethodId
    );

  console.log(
    "Bacs payment method type:",
    paymentMethod.type
  );

  if (
    paymentMethod.type !==
    "bacs_debit"
  ) {

    throw new Error(
      "SetupIntent payment method is not Bacs Direct Debit."
    );

  }

  /* =======================================================
     CUSTOMER
     ======================================================= */

  const customerId =
    typeof setupIntent.customer === "string"
      ? setupIntent.customer
      : setupIntent.customer?.id ||
        fallbackMetadata.customerId;

  if (!customerId) {

    throw new Error(
      "Bacs SetupIntent has no customer."
    );

  }

  /* =======================================================
     COMBINE METADATA
     ======================================================= */

  const metadata = {

    ...fallbackMetadata,

    ...(setupIntent.metadata || {})

  };

  /* =======================================================
     PRICE
     ======================================================= */

  const priceId =
    metadata.priceId;

  if (!priceId) {

    throw new Error(
      "Bacs setup is missing the monthly Price ID."
    );

  }

  /* =======================================================
     BILLING DAY
     ======================================================= */

  const billingDay =
    Number(
      metadata.billingDay
    );

  if (
    ![1, 15, 26].includes(
      billingDay
    )
  ) {

    throw new Error(
      "Bacs setup has an invalid billing day."
    );

  }

  /* =======================================================
     PREVENT DUPLICATE SUBSCRIPTIONS
     ======================================================= */

  const existingSubscriptions =
    await stripe.subscriptions.list({

      customer:
        customerId,

      status:
        "all",

      limit:
        100

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

    return {

      created:
        false,

      pending:
        false,

      subscriptionId:
        existingSubscription.id

    };

  }

  /* =======================================================
     CREATE MONTHLY BACS SUBSCRIPTION
     ======================================================= */

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
          metadata.checkoutSessionId ||
          ""

      }

    });

  console.log(
    "BACS SUBSCRIPTION CREATED:",
    subscription.id
  );

  console.log(
    "BACS subscription status:",
    subscription.status
  );

  return {

    created:
      true,

    pending:
      false,

    subscriptionId:
      subscription.id,

    status:
      subscription.status

  };

}


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

         IMPORTANT:
         This event ONLY confirms that the Bacs
         Checkout flow completed.

         It DOES NOT create the subscription.

         The subscription is created ONLY by
         setup_intent.succeeded.

         This prevents the same Bacs subscription
         from being created twice because both
         events can fire for the same donation.
         ===================================================== */

      if (
        event.type ===
        "checkout.session.completed"
      ) {

        const session =
          event.data.object;

        console.log(
          "Checkout session completed:",
          session.id
        );

        if (
          session.mode ===
          "setup"
        ) {

          const metadata =
            session.metadata || {};

          if (
            metadata.donationType ===
            "monthly_bacs"
          ) {

            console.log(
              "Bacs Checkout completed. Waiting for setup_intent.succeeded."
            );

          } else {

            console.log(
              "Checkout session is not a Bacs donation."
            );

          }

        } else {

          console.log(
            "Checkout session is not setup mode."
          );

        }

      }


      /* =====================================================
         NORMAL CARD / SUBSCRIPTION WEBHOOKS
         ===================================================== */

      switch (
        event.type
      ) {

        /* ===================================================
           INVOICE PAID
           =================================================== */

        case "invoice.paid":

          console.log(
            "Monthly payment successful"
          );

          break;


        /* ===================================================
           INVOICE PAYMENT FAILED
           =================================================== */

        case "invoice.payment_failed":

          console.log(
            "Monthly payment failed"
          );

          break;


        /* ===================================================
           SUBSCRIPTION CREATED
           =================================================== */

        case "customer.subscription.created":

          console.log(
            "Subscription created"
          );

          break;


        /* ===================================================
           SUBSCRIPTION UPDATED
           =================================================== */

        case "customer.subscription.updated":

          console.log(
            "Subscription updated"
          );

          break;


        /* ===================================================
           SUBSCRIPTION DELETED
           =================================================== */

        case "customer.subscription.deleted":

          console.log(
            "Subscription cancelled"
          );

          break;


        /* ===================================================
           SETUP INTENT SUCCEEDED

           THIS IS THE ONLY EVENT THAT CREATES
           THE BACS SUBSCRIPTION.
           =================================================== */

        case "setup_intent.succeeded": {

          const setupIntent =
            event.data.object;

          const metadata =
            setupIntent.metadata || {};

          console.log(
            "SetupIntent succeeded:",
            setupIntent.id
          );

          /*
           * Only process Bacs SetupIntents.
           *
           * Card monthly SetupIntents continue
           * through their normal frontend flow.
           */

          if (
            metadata.donationType ===
            "monthly_bacs"
          ) {

            await createBacsSubscriptionFromSetup(
              setupIntent.id,
              metadata
            );

          } else {

            console.log(
              "SetupIntent is not a Bacs donation."
            );

          }

          break;

        }


        /* ===================================================
           CHECKOUT SESSION COMPLETED

           Already handled above.

           IMPORTANT:
           No Bacs subscription is created here.
           =================================================== */

        case "checkout.session.completed":

          break;


        /* ===================================================
           OTHER EVENTS
           =================================================== */

        default:

          console.log(
            "Unhandled event type:",
            event.type
          );

      }

      return res.json({

        received:
          true

      });

    } catch (err) {

      console.error(
        "WEBHOOK PROCESSING ERROR:",
        err.message
      );

      return res
        .status(500)
        .json({

          received:
            false,

          error:
            err.message

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
   GET ACTIVE DONATION PRODUCTS + PRICES
   ========================================================= */

app.get(
  "/donation-options",
  async (req, res) => {

    try {

      const prices =
        await stripe.prices.list({

          active:
            true,

          currency:
            "gbp",

          limit:
            100,

          expand: [
            "data.product"
          ]

        });

      const products = {};

      prices.data.forEach(
        price => {

          const product =
            price.product;

          /* =================================================
             IGNORE INVALID PRODUCTS
             ================================================= */

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

          /* =================================================
             CREATE PRODUCT ENTRY
             ================================================= */

          if (
            !products[
              product.id
            ]
          ) {

            products[
              product.id
            ] = {

              id:
                product.id,

              name:
                product.name,

              monthlyPrices:
                [],

              oneOffPrices:
                []

            };

          }

          /* =================================================
             MONTHLY RECURRING PRICE
             ================================================= */

          if (
            price.type ===
              "recurring" &&
            price.recurring &&
            price.recurring.interval ===
              "month" &&
            price.recurring.interval_count ===
              1
          ) {

            products[
              product.id
            ].monthlyPrices.push({

              id:
                price.id,

              amount:
                price.unit_amount,

              currency:
                price.currency,

              interval:
                price.recurring.interval

            });

            return;

          }

          /* =================================================
             ONE-OFF PRICE
             ================================================= */

          if (
            price.type ===
            "one_time"
          ) {

            const customUnitAmount =
              price.custom_unit_amount
                ? {

                    minimum:
                      price.custom_unit_amount
                        .minimum,

                    maximum:
                      price.custom_unit_amount
                        .maximum,

                    preset:
                      price.custom_unit_amount
                        .preset

                  }
                : null;

            products[
              product.id
            ].oneOffPrices.push({

              id:
                price.id,

              amount:
                price.unit_amount,

              currency:
                price.currency,

              customUnitAmount

            });

          }

        }
      );

      /* =====================================================
         CONVERT OBJECT → ARRAY
         ===================================================== */

      const productList =
        Object.values(
          products
        );

      /* =====================================================
         SORT PRICES
         ===================================================== */

      productList.forEach(
        product => {

          product.monthlyPrices.sort(
            (a, b) =>
              Number(
                a.amount || 0
              ) -
              Number(
                b.amount || 0
              )
          );

          product.oneOffPrices.sort(
            (a, b) => {

              const aAmount =
                a.amount ??
                a.customUnitAmount?.preset ??
                a.customUnitAmount?.minimum ??
                0;

              const bAmount =
                b.amount ??
                b.customUnitAmount?.preset ??
                b.customUnitAmount?.minimum ??
                0;

              return (
                Number(aAmount) -
                Number(bAmount)
              );

            }
          );

        }
      );

      /* =====================================================
         ONLY RETURN PRODUCTS THAT HAVE
         AT LEAST ONE USABLE PRICE
         ===================================================== */

      const filteredProducts =
        productList.filter(
          product =>
            product.monthlyPrices.length >
              0 ||
            product.oneOffPrices.length >
              0
        );

      console.log(
        "Donation options loaded:",
        filteredProducts.length,
        "products"
      );

      return res.json({

        products:
          filteredProducts

      });

    } catch (err) {

      console.error(
        "DONATION OPTIONS ERROR:",
        err.message
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
        "Monthly Card customer created:",
        customer.id
      );

      /* =====================================================
         VALIDATE BILLING DAY
         ===================================================== */

      const billingDay =
        Number(
          startDate
        );

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

      if (
        !priceId
      ) {

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

            enabled:
              true

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
        "Monthly Card SetupIntent created:",
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
        err.message
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
   CREATE ONE-OFF CARD PAYMENT
   ========================================================= */

app.post(
  "/create-one-off-payment",
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
        donationCause,
        priceId,
        donationAmount
      } = req.body;

      /* =====================================================
         VALIDATE PRICE ID
         ===================================================== */

      if (
        !priceId
      ) {

        return res
          .status(400)
          .json({

            error:
              "Missing one-off price ID."

          });

      }

      /* =====================================================
         RETRIEVE PRICE FROM STRIPE
         ===================================================== */

      const price =
        await stripe.prices.retrieve(
          priceId
        );

      /* =====================================================
         MAKE SURE THIS IS A ONE-OFF PRICE
         ===================================================== */

      if (
        price.type !==
        "one_time"
      ) {

        return res
          .status(400)
          .json({

            error:
              "The selected price is not a one-off donation price."

          });

      }

      /* =====================================================
         MAKE SURE PRICE IS ACTIVE
         ===================================================== */

      if (
        !price.active
      ) {

        return res
          .status(400)
          .json({

            error:
              "The selected donation price is no longer available."

          });

      }

      /* =====================================================
         MAKE SURE PRICE IS GBP
         ===================================================== */

      if (
        price.currency !==
        "gbp"
      ) {

        return res
          .status(400)
          .json({

            error:
              "The selected donation price is not in GBP."

          });

      }

      /* =====================================================
         VALIDATE ENTERED DONATION AMOUNT
         ===================================================== */

      const amountString =
        String(
          donationAmount ??
          ""
        ).trim();

      if (
        !/^\d+(?:\.\d{1,2})?$/.test(
          amountString
        )
      ) {

        return res
          .status(400)
          .json({

            error:
              "Please enter a valid donation amount using pounds and pence."

          });

      }

      const enteredAmount =
        Number(
          amountString
        );

      if (
        !Number.isFinite(
          enteredAmount
        ) ||
        enteredAmount <= 0
      ) {

        return res
          .status(400)
          .json({

            error:
              "The donation amount must be greater than £0."

          });

      }

      /* =====================================================
         CONVERT TO PENCE
         ===================================================== */

      const amountInPence =
        Math.round(
          enteredAmount *
          100
        );

      if (
        amountInPence <= 0
      ) {

        return res
          .status(400)
          .json({

            error:
              "The donation amount is invalid."

          });

      }

      /* =====================================================
         CUSTOM AMOUNT PRICE
         ===================================================== */

      if (
        price.custom_unit_amount
      ) {

        const minimum =
          Number(
            price.custom_unit_amount
              .minimum
          );

        const maximum =
          Number(
            price.custom_unit_amount
              .maximum
          );

        if (
          !Number.isInteger(
            minimum
          ) ||
          !Number.isInteger(
            maximum
          )
        ) {

          return res
            .status(400)
            .json({

              error:
                "The Stripe custom donation limits are invalid."

            });

        }

        if (
          amountInPence <
          minimum
        ) {

          return res
            .status(400)
            .json({

              error:
                `The minimum donation is £${(
                  minimum / 100
                ).toFixed(2)}.`

            });

        }

        if (
          amountInPence >
          maximum
        ) {

          return res
            .status(400)
            .json({

              error:
                `The maximum donation is £${(
                  maximum / 100
                ).toFixed(2)}.`

            });

        }

      }

      /* =====================================================
         FIXED ONE-OFF PRICE
         ===================================================== */

      else {

        if (
          price.unit_amount ===
            null ||
          price.unit_amount ===
            undefined
        ) {

          return res
            .status(400)
            .json({

              error:
                "The selected Stripe Price does not have a valid amount configuration."

            });

        }

        if (
          amountInPence !==
          Number(
            price.unit_amount
          )
        ) {

          return res
            .status(400)
            .json({

              error:
                `The selected donation amount must be £${(
                  Number(
                    price.unit_amount
                  ) / 100
                ).toFixed(2)}.`

            });

        }

      }

      console.log(
        "One-off donation amount validated."
      );

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

      const customerAddress =
        address ||
        postcode
          ? {

              line1:
                address ||
                undefined,

              postal_code:
                postcode ||
                undefined,

              country:
                stripeCountry ||
                undefined

            }
          : undefined;

      /* =====================================================
         CREATE CUSTOMER
         ===================================================== */

      const customer =
        await stripe.customers.create({

          email,

          name:
            fullName,

          phone,

          address:
            customerAddress,

          metadata: {

            donationType:
              "one_off",

            donationCause:
              donationCause ||
              "",

            giftAid:
              giftAid
                ? "yes"
                : "no",

            priceId,

            donationAmount:
              enteredAmount.toFixed(
                2
              )

          }

        });

      console.log(
        "One-off customer created:",
        customer.id
      );

      /* =====================================================
         CREATE PAYMENT INTENT
         ===================================================== */

      const paymentIntent =
        await stripe.paymentIntents.create({

          amount:
            amountInPence,

          currency:
            price.currency,

          customer:
            customer.id,

          payment_method_types: [
            "card"
          ],

          metadata: {

            donationType:
              "one_off",

            donationCause:
              donationCause ||
              "",

            donationAmount:
              enteredAmount.toFixed(
                2
              ),

            giftAid:
              giftAid
                ? "yes"
                : "no",

            priceId,

            customerId:
              customer.id

          }

        });

      console.log(
        "One-off PaymentIntent created:",
        paymentIntent.id
      );

      console.log(
        "PaymentIntent status:",
        paymentIntent.status
      );

      return res.json({

        success:
          true,

        mode:
          "payment",

        clientSecret:
          paymentIntent.client_secret,

        paymentIntentId:
          paymentIntent.id,

        customerId:
          customer.id,

        priceId,

        amount:
          amountInPence

      });

    } catch (err) {

      console.error(
        "ONE-OFF PAYMENT ERROR:",
        err.message
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
        "Creating monthly Card subscription:",
        setupIntentId
      );

      /* =====================================================
         VALIDATE BILLING DAY
         ===================================================== */

      const validBillingDays =
        [1, 15, 26];

      if (
        !validBillingDays.includes(
          Number(
            billingDay
          )
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

      const setupIntentCustomerId =
        typeof setupIntent.customer ===
          "string"
          ? setupIntent.customer
          : setupIntent.customer?.id;

      if (
        setupIntentCustomerId !==
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
        typeof setupIntent.payment_method ===
          "string"
          ? setupIntent.payment_method
          : setupIntent.payment_method.id;

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
        "Monthly Card subscription created:",
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
        err.message
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

      /* =====================================================
         VALIDATE BILLING DAY
         ===================================================== */

      const billingDay =
        Number(
          startDate
        );

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

      if (
        !priceId
      ) {

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
              donationCause ||
              "",

            donationAmount:
              String(
                donationAmount ||
                ""
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

          /*
           * IMPORTANT:
           *
           * This is payment_method_types,
           * NOT allowed_payment_method_types.
           */

          payment_method_types: [
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
                  donationAmount ||
                  ""
                ),

              donationCause:
                donationCause ||
                "",

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
                donationAmount ||
                ""
              ),

            donationCause:
              donationCause ||
              "",

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

          success_url:
            `${req.protocol}://${req.get(
              "host"
            )}/bacs-success`,

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
        err.message
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
   ========================================================= */

app.get(
  "/bacs-success",
  (req, res) => {

    res.redirect(
      "/"
    );

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