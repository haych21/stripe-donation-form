require("dotenv").config();

console.log("Stripe key loaded:", !!process.env.STRIPE_SECRET_KEY);

const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors());

/* =========================================================
   STRIPE WEBHOOK
   ========================================================= */

app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const signature = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error(
        "Webhook signature verification failed:",
        err.message
      );

      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("================================");
    console.log("WEBHOOK RECEIVED");
    console.log("Event type:", event.type);
    console.log("Event ID:", event.id);
    console.log("================================");

    switch (event.type) {
      case "invoice.paid":
        console.log("Monthly payment successful");
        break;

      case "invoice.payment_failed":
        console.log("Monthly payment failed");
        break;

      case "customer.subscription.created":
        console.log("Subscription created");
        break;

      case "customer.subscription.updated":
        console.log("Subscription updated");
        break;

      case "customer.subscription.deleted":
        console.log("Subscription cancelled");
        break;

      case "setup_intent.succeeded":
        console.log("Payment method successfully saved");
        break;

      default:
        console.log("Unhandled event type:", event.type);
    }

    res.json({ received: true });
  }
);

/* =========================================================
   NORMAL JSON ROUTES
   ========================================================= */

app.use(express.json());

app.use(express.static("public"));

/* =========================================================
   CREATE MONTHLY DONATION PAYMENT SETUP
   ========================================================= */

app.post("/create-subscription", async (req, res) => {
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

    console.log("================================");
    console.log("NEW MONTHLY DONATION");
    console.log("Email:", email);
    console.log("Amount:", donationAmount);
    console.log("Start date:", startDate);
    console.log("Cause:", donationCause);
    console.log("================================");

    /* =====================================================
       CREATE CUSTOMER
       ===================================================== */

    const customer = await stripe.customers.create({
      email,
      name: fullName,
      phone,

      address: {
        country
      },

      metadata: {
        giftAid: giftAid ? "yes" : "no",
        donationCause: donationCause || ""
      }
    });

    console.log("Customer created:", customer.id);

    /* =====================================================
       VALIDATE MONTHLY DONATION
       ===================================================== */

    const billingDay = Number(startDate);

    if (![1, 15, 26].includes(billingDay)) {
      return res.status(400).json({
        error: "Invalid start date"
      });
    }

    if (!priceId) {
      return res.status(400).json({
        error: "Missing monthly price ID"
      });
    }

    /* =====================================================
       CREATE SETUP INTENT

       The SetupIntent saves the donor's payment method
       before the monthly subscription is created.

       Supported payment methods:
       - Card
       - Bacs Direct Debit

       No donation is charged at this stage.
       ===================================================== */

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,

      payment_method_types: [
        "card",
        "bacs_debit"
      ],

      metadata: {
        donationType: "monthly",
        donationAmount: String(donationAmount),
        billingDay: String(billingDay),
        giftAid: giftAid ? "yes" : "no",
        donationCause: donationCause || "",
        priceId
      }
    });

    console.log(
      "SetupIntent created:",
      setupIntent.id
    );

    return res.json({
      mode: "setup",

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
    console.error("PAYMENT ERROR:", err);

    res.status(500).json({
      error: err.message
    });
  }
});

/* =========================================================
   CREATE MONTHLY SUBSCRIPTION
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

      console.log("================================");
      console.log("CREATING MONTHLY SUBSCRIPTION");
      console.log("Customer:", customerId);
      console.log("SetupIntent:", setupIntentId);
      console.log("Price:", priceId);
      console.log("Billing day:", billingDay);
      console.log("================================");

      /* =====================================================
         VALIDATE BILLING DAY
         ===================================================== */

      const validBillingDays = [1, 15, 26];

      if (!validBillingDays.includes(Number(billingDay))) {
        return res.status(400).json({
          error: "Invalid billing day"
        });
      }

      /* =====================================================
         RETRIEVE SETUP INTENT
         ===================================================== */

      const setupIntent =
        await stripe.setupIntents.retrieve(
          setupIntentId
        );

      if (setupIntent.status !== "succeeded") {
        return res.status(400).json({
          error:
            "Payment method has not been successfully saved."
        });
      }

      if (!setupIntent.payment_method) {
        return res.status(400).json({
          error:
            "No payment method was found on the SetupIntent."
        });
      }

      /* =====================================================
         MAKE SURE SETUP INTENT BELONGS TO CUSTOMER
         ===================================================== */

      if (setupIntent.customer !== customerId) {
        return res.status(400).json({
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
         CREATE SUBSCRIPTION

         billing_cycle_anchor_config makes recurring
         billing happen on the selected day.

         proration_behavior: "none" prevents the initial
         partial-period charge.

         The payment method is taken from the completed
         SetupIntent, whether it is a card or Bacs.
         ===================================================== */

      const subscription =
        await stripe.subscriptions.create({
          customer: customerId,

          items: [
            {
              price: priceId
            }
          ],

          default_payment_method:
            paymentMethodId,

          billing_cycle_anchor_config: {
            day_of_month:
              Number(billingDay)
          },

          proration_behavior: "none",

          metadata: {
            donationType: "monthly",
            billingDay:
              String(billingDay)
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
        success: true,

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

      res.status(500).json({
        error: err.message
      });
    }
  }
);

/* =========================================================
   START SERVER
   ========================================================= */

app.listen(
  process.env.PORT || 3000,
  () => {
    console.log("Server running");
  }
);