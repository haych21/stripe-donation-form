// =============================
// STRIPE INIT
// =============================
const stripe = Stripe(
  "pk_test_51TYkg6EPmNke8msB4Yvsmr1Wg12tWt8DDu23mv12X1WuV2T0WvoZwUDLzuldsSa73v1jVMwwrNx1TkXGq3fSmKdb00YBQ7YEJC"
);

console.log("JS is connected and running");

let elements = null;
let paymentElement = null;

let monthlySetupData = null;

let paymentReady = false;


// =============================
// STRIPE PRICE IDS
// =============================
const priceMap = {
  "Palestine Emergency Aid": {
    5: "price_1TYqQ7EPmNke8msBIru7huCa",
    10: "price_1Tl8uREPmNke8msBJkAncV2X",
    15: "price_1TYqQ7EPmNke8msBVxpmWAKw"
  },

  "Clean Water": {
    5: "price_1Tl8vmEPmNke8msBOqrwefCk",
    10: "price_1Tl8w9EPmNke8msBi7uBQ5GH",
    15: "price_1Tl8w9EPmNke8msBYCNNA0yo"
  },

  "Food Relief": {
    5: "price_1Tl8yvEPmNke8msBWW6MHIGW",
    10: "price_1Tl8yvEPmNke8msBhe56PkY4",
    15: "price_1Tl8yvEPmNke8msBAxQjTEVw"
  }
};


// =============================
// GET ELEMENTS
// =============================
const causeSelect =
  document.getElementById("cause-select");

const amountSelect =
  document.getElementById("donation-amount");

const startDateSelect =
  document.getElementById("start-date");

const form =
  document.querySelector("form");

const submitButton =
  form.querySelector('button[type="submit"]');

const inputs =
  document.querySelectorAll("input");


// =============================
// INPUT RESET
// =============================
inputs.forEach(input => {

  input.addEventListener("input", () => {

    input.classList.remove(
      "input-error"
    );

  });

});


// =============================
// START DATE RESET
// =============================
startDateSelect.addEventListener(
  "change",
  () => {

    startDateSelect.classList.remove(
      "input-error"
    );

  }
);


// =============================
// RESET STRIPE
// =============================
function resetStripe() {

  if (paymentElement) {

    paymentElement.destroy();

    paymentElement = null;

  }

  elements = null;

  monthlySetupData = null;

  paymentReady = false;

  const paymentContainer =
    document.getElementById(
      "payment-element"
    );

  if (paymentContainer) {

    paymentContainer.innerHTML = "";

  }

  submitButton.textContent =
    "Continue To Payment";

}


// =============================
// SETUP STRIPE
// =============================
async function setupStripe() {

  try {

    const emailInput =
      form.querySelector(
        'input[type="email"]'
      );

    const fullName =
      document.getElementById(
        "full-name"
      ).value;

    const phone =
      document.getElementById(
        "phone"
      ).value;

    const country =
      document.getElementById(
        "country"
      ).value;

    const giftAidChecked =
      document.getElementById(
        "gift-aid"
      ).checked;


    // =============================
    // CURRENT SELECTIONS
    // =============================

    const cause =
      causeSelect.value;

    const donationAmount =
      Number(
        amountSelect.value
      );

    const startDate =
      Number(
        startDateSelect.value
      );


    console.log(
      "Selected cause:",
      cause
    );

    console.log(
      "Selected amount:",
      donationAmount
    );

    console.log(
      "Selected start date:",
      startDate
    );


    // =============================
    // PRICE LOOKUP
    // =============================

    const selectedPriceId =
      priceMap?.[cause]?.[
        donationAmount
      ];


    console.log(
      "Selected price ID:",
      selectedPriceId
    );


    // =============================
    // SAFETY CHECK
    // =============================

    if (!selectedPriceId) {

      console.error(
        "No price ID found for selection."
      );

      alert(
        "We could not find the selected donation price."
      );

      return false;

    }


    // =============================
    // RESET OLD STRIPE ELEMENTS
    // =============================

    resetStripe();


    // =============================
    // SEND TO BACKEND
    // =============================

    const res =
      await fetch(
        "https://stripedonationform.onrender.com/create-subscription",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            email: emailInput.value,

            priceId: selectedPriceId,

            giftAid: giftAidChecked,

            fullName,

            phone,

            country,

            donationAmount,

            startDate,

            donationCause: cause

          })

        }
      );


    const data =
      await res.json();


    console.log(
      "Backend response:",
      data
    );


    if (!res.ok) {

      console.error(
        "Backend error:",
        data.error
      );

      alert(
        data.error ||
        "Something went wrong."
      );

      return false;

    }


    // =============================
    // MONTHLY PAYMENT SETUP
    // =============================

    if (
      data.mode !== "setup"
    ) {

      console.error(
        "Unexpected Stripe response."
      );

      alert(
        "Something went wrong while setting up your monthly donation."
      );

      return false;

    }


    if (
      !data.setupClientSecret
    ) {

      console.error(
        "Missing SetupIntent client secret."
      );

      return false;

    }


    // =============================
    // SAVE MONTHLY SETUP DATA
    // =============================

    monthlySetupData = {

      setupIntentId:
        data.setupIntentId,

      customerId:
        data.customerId,

      priceId:
        data.priceId,

      billingDay:
        data.billingDay

    };


    // =============================
    // CREATE STRIPE ELEMENTS
    // =============================

    elements =
      stripe.elements({

        clientSecret:
          data.setupClientSecret

      });


    paymentElement =
      elements.create(
        "payment"
      );


    paymentElement.mount(
      "#payment-element"
    );


    // =============================
    // PAYMENT READY
    // =============================

    paymentReady = true;


    submitButton.textContent =
      "Start Monthly Donation";


    console.log(
      "Payment Element mounted for monthly setup."
    );

    console.log(
      "Payment form is ready for card details."
    );


    return true;


  } catch (err) {

    console.error(
      "Stripe setup error:",
      err
    );

    alert(
      "Something went wrong while setting up the payment."
    );

    return false;

  }

}


// =============================
// CREATE MONTHLY SUBSCRIPTION
// =============================
async function createMonthlySubscription() {

  try {

    console.log(
      "Saving payment method..."
    );


    const {
      error,
      setupIntent
    } =
      await stripe.confirmSetup({

        elements,

        confirmParams: {

          return_url:
            window.location.href

        },

        redirect:
          "if_required"

      });


    if (error) {

      console.error(
        "Setup error:",
        error.message
      );

      alert(
        error.message
      );

      return;

    }


    console.log(
      "Payment method saved."
    );

    console.log(
      "SetupIntent:",
      setupIntent
    );


    // =============================
    // CREATE MONTHLY SUBSCRIPTION
    // =============================

    console.log(
      "Creating monthly subscription..."
    );


    const response =
      await fetch(
        "https://stripedonationform.onrender.com/create-monthly-subscription",
        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body: JSON.stringify({

            customerId:
              monthlySetupData.customerId,

            setupIntentId:
              monthlySetupData.setupIntentId,

            priceId:
              monthlySetupData.priceId,

            billingDay:
              monthlySetupData.billingDay

          })

        }
      );


    const data =
      await response.json();


    console.log(
      "Subscription response:",
      data
    );


    if (!response.ok) {

      console.error(
        "Subscription creation failed:",
        data.error
      );

      alert(
        data.error ||
        "Could not create your monthly donation."
      );

      return;

    }


    console.log(
      "Monthly subscription created:",
      data.subscriptionId
    );

    console.log(
      "Subscription status:",
      data.status
    );


    // =============================
    // SUCCESS
    // =============================

    alert(
      "Your monthly donation has been set up successfully 🎉"
    );


  } catch (err) {

    console.error(
      "Subscription request failed:",
      err
    );

    alert(
      "Something went wrong while creating your monthly donation."
    );

  }

}


// =============================
// FORM SUBMIT
// =============================
form.addEventListener(
  "submit",
  async (e) => {

    e.preventDefault();


    // =================================================
    // SECOND CLICK
    // =================================================
    // Stripe Payment Element is already visible.
    // The donor has entered their payment details.
    // Confirm the SetupIntent and create the subscription.

    if (
      paymentReady
    ) {

      submitButton.disabled = true;

      submitButton.textContent =
        "Processing...";


      await createMonthlySubscription();


      submitButton.disabled = false;

      submitButton.textContent =
        "Start Monthly Donation";


      return;

    }


    let valid = true;


    // =============================
    // RESET ERRORS
    // =============================

    inputs.forEach(input => {

      input.classList.remove(
        "input-error"
      );

    });


    // =============================
    // REQUIRED INPUTS
    // =============================

    inputs.forEach(input => {

      if (
        input.type !== "checkbox" &&
        !input.value.trim()
      ) {

        input.classList.add(
          "input-error"
        );

        valid = false;

      }

    });


    // =============================
    // EMAIL VALIDATION
    // =============================

    const emailInput =
      form.querySelector(
        'input[type="email"]'
      );


    if (
      emailInput &&
      !emailInput.value.includes("@")
    ) {

      emailInput.classList.add(
        "input-error"
      );

      valid = false;

    }


    // =============================
    // START DATE
    // =============================

    if (
      !startDateSelect.value
    ) {

      startDateSelect.classList.add(
        "input-error"
      );

      valid = false;

    }


    // =============================
    // STOP IF INVALID
    // =============================

    if (!valid) {

      console.log(
        "Form validation failed."
      );

      return;

    }


    // =============================
    // FIRST CLICK
    // =============================

    submitButton.disabled = true;

    submitButton.textContent =
      "Preparing Payment...";


    const ready =
      await setupStripe();


    submitButton.disabled = false;


    if (!ready) {

      console.error(
        "Stripe setup failed."
      );

      submitButton.textContent =
        "Continue To Payment";

      return;

    }


    console.log(
      "Stripe is ready."
    );


    // The button text is changed
    // inside setupStripe().

  }
);