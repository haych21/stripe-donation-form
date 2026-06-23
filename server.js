require("dotenv").config();

console.log("STRIPE KEY:", process.env.STRIPE_SECRET_KEY);

const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));


// =============================
// CREATE SUBSCRIPTION
// =============================
app.post("/create-subscription", async (req, res) => {
  try {
    const {
      email,
      priceId,
      giftAid,
      fullName,
      phone,
      country,
      frequency,
      donationAmount
    } = req.body;

    console.log("Email:", email);
    console.log("Price ID:", priceId);
    console.log("Frequency:", frequency);

    // =============================
    // CREATE CUSTOMER
    // =============================
    const customer = await stripe.customers.create({
      email,
      name: fullName,
      phone,
      address: { country },
      metadata: {
        giftAid: giftAid ? "yes" : "no",
      },
    });

    // =============================
    // ONE-TIME PAYMENT FLOW
    // =============================
    if (frequency === "one-time") {

      const amountMap = {
        5: 500,
        10: 1000,
        15: 1500
      };

      const amount = amountMap[donationAmount];

      if (!amount) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "gbp",
        customer: customer.id,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return res.json({
        clientSecret: paymentIntent.client_secret,
      });
    }

    // =============================
    // MONTHLY SUBSCRIPTION FLOW
    // =============================
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price: priceId,
        },
      ],
      payment_behavior: "default_incomplete",

      payment_settings: {
        payment_method_types: ["card", "bacs_debit"],
        save_default_payment_method: "on_subscription",
      },

      expand: ["latest_invoice.confirmation_secret"],
    });

    console.log("Subscription created:", subscription.id);

    return res.json({
      clientSecret:
        subscription.latest_invoice.confirmation_secret.client_secret,
      subscriptionId: subscription.id,
    });

  } catch (err) {
    console.error("PAYMENT ERROR:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});


// =============================
// START SERVER
// =============================
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});