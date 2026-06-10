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

    const { email, priceId, giftAid, fullName, phone, country,} = req.body;

    console.log("Email:", email);
    console.log("Price ID:", priceId);

    // CREATE CUSTOMER
    const customer = await stripe.customers.create({
      email,

      name: fullName,

      phone,

      address: {

      country,
    },

       metadata: {
        giftAid: giftAid ? "yes" : "no",
       },
    });

    // CREATE SUBSCRIPTION
    const subscription = await stripe.subscriptions.create({

      customer: customer.id,

      items: [
        {
          price: priceId,
        },
      ],

      payment_behavior: "default_incomplete",

      payment_settings: {
        payment_method_types: ["bacs_debit"],
        save_default_payment_method: "on_subscription",
      },

      expand: ["latest_invoice.confirmation_secret"],
    });

    console.log("Subscription created:", subscription.id);

    // SEND CLIENT SECRET
    res.json({

      clientSecret:
        subscription.latest_invoice.confirmation_secret.client_secret,

      subscriptionId: subscription.id,
    });

  } catch (err) {

    console.error("SUBSCRIPTION ERROR:", err);

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