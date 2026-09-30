// =============================
// STRIPE INIT
// =============================

const stripe = Stripe(
  "pk_test_51TYkg6EPmNke8msB4Yvsmr1Wg12tWt8DDu23mv12X1WuV2T0WvoZwUDLzuldsSa73v1jVMwwrNx1TkXGq3fSmKdb00YBQ7YEJC"
);

console.log("JS is connected and running");


// =============================
// API URL
// =============================
// Automatically switches between
// local development and production.
//
// LOCAL:
// Live Server → localhost:3000
//
// LIVE:
// Website → Render backend
// =============================

const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://stripedonationform.onrender.com";

console.log(
  "API URL:",
  API_URL
);


// =============================
// STRIPE VARIABLES
// =============================

let elements = null;
let paymentElement = null;

let monthlySetupData = null;

let paymentReady = false;


// =============================
// STRIPE DONATION OPTIONS
// =============================
// Stripe is now the source of truth.
//
// Products and Prices are loaded from:
// /donation-options
//
// Nothing is hard-coded here anymore.
// =============================

let priceMap = {};

let donationOptionsReady = false;


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
  form.querySelector(
    'button[type="submit"]'
  );

const inputs =
  document.querySelectorAll("input");


// =============================
// PAYMENT ELEMENT CONTAINER
// =============================

const paymentPlaceholder =
  document.querySelector(
    ".payment-placeholder"
  );


// =============================
// GET PAYMENT METHOD
// =============================

function getPaymentMethod() {

  const selected =
    document.querySelector(
      'input[name="payment-method"]:checked'
    );

  return selected
    ? selected.value
    : "card";

}


// =============================
// SHOW / HIDE PAYMENT ELEMENT
// =============================

function updatePaymentMethodUI() {

  const paymentMethod =
    getPaymentMethod();


  if (!paymentPlaceholder) {

    return;

  }


  // =============================
  // BACS
  // =============================

  if (
    paymentMethod === "bacs_debit"
  ) {

    paymentPlaceholder.style.display =
      "none";


    resetStripe(false);


    submitButton.textContent =
      "Continue To Payment";


    return;

  }


  // =============================
  // CARD
  // =============================

  paymentPlaceholder.style.display =
    "";


  submitButton.textContent =
    paymentReady
      ? "Start Monthly Donation"
      : "Continue To Payment";

}


// =============================
// PAYMENT METHOD CHANGE
// =============================

const paymentMethodInputs =
  document.querySelectorAll(
    'input[name="payment-method"]'
  );


paymentMethodInputs.forEach(
  input => {

    input.addEventListener(
      "change",
      () => {

        console.log(
          "Payment method changed:",
          input.value
        );


        resetStripe(false);


        updatePaymentMethodUI();

      }
    );

  }
);


// =============================
// INPUT RESET
// =============================

inputs.forEach(input => {

  input.addEventListener(
    "input",
    () => {

      input.classList.remove(
        "input-error"
      );

    }
  );

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

function resetStripe(
  resetButtonText = true
) {

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


  if (
    resetButtonText &&
    submitButton
  ) {

    submitButton.textContent =
      "Continue To Payment";

  }

}


// =============================
// LOAD DONATION OPTIONS
// =============================
// Gets Products + Prices from Stripe
// through your backend.
//
// Stripe is now the source of truth.
// =============================

async function loadDonationOptions() {

  try {

    console.log(
      "Loading donation options from Stripe..."
    );


    // =============================
    // DISABLE DROPDOWNS WHILE LOADING
    // =============================

    causeSelect.disabled =
      true;

    amountSelect.disabled =
      true;


    // =============================
    // GET DATA FROM BACKEND
    // =============================

    const response =
      await fetch(
        `${API_URL}/donation-options`
      );


    const data =
      await response.json();


    console.log(
      "Donation options response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Could not load donation options."
      );

    }


    // =============================
    // RESET LOCAL PRICE MAP
    // =============================

    priceMap = {};


    // =============================
    // RESET CAUSE DROPDOWN
    // =============================

    causeSelect.innerHTML = `
      <option value="" disabled selected>
        Select a cause
      </option>
    `;


    // =============================
    // RESET AMOUNT DROPDOWN
    // =============================

    amountSelect.innerHTML = `
      <option value="" disabled selected>
        Select an amount
      </option>
    `;


    // =============================
    // ADD PRODUCTS
    // =============================

    data.products.forEach(
      product => {

        const productOption =
          document.createElement(
            "option"
          );


        productOption.value =
          product.name;


        productOption.textContent =
          product.name;


        causeSelect.appendChild(
          productOption
        );


        // =============================
        // CREATE PRODUCT PRICE MAP
        // =============================

        priceMap[
          product.name
        ] = {};


        // =============================
        // ADD PRICES
        // =============================

        product.prices.forEach(
          price => {

            const amount =
              price.amount / 100;


            priceMap[
              product.name
            ][amount] =
              price.id;

          }
        );

      }
    );


    // =============================
    // ENABLE CAUSE DROPDOWN
    // =============================

    causeSelect.disabled =
      false;


    // Amount stays disabled until
    // a cause is selected.

    amountSelect.disabled =
      true;


    // =============================
    // READY
    // =============================

    donationOptionsReady =
      true;


    console.log(
      "Donation options successfully loaded."
    );


    console.log(
      "Dynamic price map:",
      priceMap
    );


  } catch (err) {

    console.error(
      "Failed to load donation options:",
      err
    );


    donationOptionsReady =
      false;


    // =============================
    // SHOW ERROR IN DROPDOWNS
    // =============================

    causeSelect.innerHTML = `
      <option value="">
        Unable to load causes
      </option>
    `;


    amountSelect.innerHTML = `
      <option value="">
        Unable to load amounts
      </option>
    `;


    causeSelect.disabled =
      true;

    amountSelect.disabled =
      true;


    alert(
      "We could not load the available donation options. Please refresh the page and try again."
    );

  }

}


// =============================
// CAUSE CHANGE
// =============================
// When a Product is selected,
// load its active monthly Prices.
// =============================

causeSelect.addEventListener(
  "change",
  () => {

    const selectedCause =
      causeSelect.value;


    // =============================
    // RESET AMOUNT DROPDOWN
    // =============================

    amountSelect.innerHTML = `
      <option value="" disabled selected>
        Select an amount
      </option>
    `;


    // =============================
    // CHECK PRODUCT
    // =============================

    if (
      !selectedCause ||
      !priceMap[selectedCause]
    ) {

      amountSelect.disabled =
        true;


      return;

    }


    // =============================
    // GET PRODUCT PRICES
    // =============================

    const prices =
      priceMap[selectedCause];


    // =============================
    // SORT PRICES
    // LOWEST → HIGHEST
    // =============================

    Object.keys(prices)
      .sort(
        (a, b) =>
          Number(a) - Number(b)
      )
      .forEach(
        amount => {

          const option =
            document.createElement(
              "option"
            );


          option.value =
            amount;


          option.textContent =
            `£${amount} / month`;


          amountSelect.appendChild(
            option
          );

        }
      );


    // =============================
    // ENABLE AMOUNT DROPDOWN
    // =============================

    amountSelect.disabled =
      false;

  }
);


// =============================
// INITIAL PAYMENT UI
// =============================

updatePaymentMethodUI();


// =============================
// GET DONATION DATA
// =============================

function getDonationData() {

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


  const address =
    document.getElementById(
      "address"
    ).value;


  const postcode =
    document.getElementById(
      "postcode"
    ).value;


  const country =
    document.getElementById(
      "country"
    ).value;


  const giftAidChecked =
    document.getElementById(
      "gift-aid"
    ).checked;


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


  // =============================
  // GET DYNAMIC STRIPE PRICE ID
  // =============================

  const selectedPriceId =
    priceMap?.[cause]?.[
      donationAmount
    ];


  return {

    email:
      emailInput.value,

    fullName,

    phone,

    address,

    postcode,

    country,

    giftAid:
      giftAidChecked,

    donationAmount,

    startDate,

    donationCause:
      cause,

    priceId:
      selectedPriceId

  };

}


// =============================
// SETUP CARD PAYMENT
// =============================

async function setupStripe() {

  try {

    const donationData =
      getDonationData();


    console.log(
      "Selected cause:",
      donationData.donationCause
    );


    console.log(
      "Selected amount:",
      donationData.donationAmount
    );


    console.log(
      "Selected start date:",
      donationData.startDate
    );


    console.log(
      "Selected price ID:",
      donationData.priceId
    );


    // =============================
    // SAFETY CHECK
    // =============================

    if (!donationData.priceId) {

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
        `${API_URL}/create-subscription`,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              email:
                donationData.email,

              priceId:
                donationData.priceId,

              giftAid:
                donationData.giftAid,

              fullName:
                donationData.fullName,

              phone:
                donationData.phone,

              country:
                donationData.country,

              donationAmount:
                donationData.donationAmount,

              startDate:
                donationData.startDate,

              donationCause:
                donationData.donationCause

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

    paymentReady =
      true;


    submitButton.textContent =
      "Start Monthly Donation";


    console.log(
      "Payment Element mounted for monthly setup."
    );


    console.log(
      "Payment form is ready."
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
        `${API_URL}/create-monthly-subscription`,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

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
// CREATE BACS CHECKOUT
// =============================

async function createBacsCheckout() {

  try {

    const donationData =
      getDonationData();


    console.log(
      "Preparing Bacs Direct Debit..."
    );


    console.log(
      "Bacs donation data:",
      donationData
    );


    // =============================
    // PRICE CHECK
    // =============================

    if (!donationData.priceId) {

      console.error(
        "No price ID found for Bacs donation."
      );


      alert(
        "We could not find the selected donation price."
      );


      return;

    }


    // =============================
    // CALL BACS BACKEND
    // =============================

    const response =
      await fetch(
        `${API_URL}/create-bacs-checkout-session`,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json"

          },

          body:
            JSON.stringify({

              email:
                donationData.email,

              fullName:
                donationData.fullName,

              phone:
                donationData.phone,

              address:
                donationData.address,

              postcode:
                donationData.postcode,

              country:
                donationData.country,

              giftAid:
                donationData.giftAid,

              donationAmount:
                donationData.donationAmount,

              startDate:
                donationData.startDate,

              donationCause:
                donationData.donationCause,

              priceId:
                donationData.priceId

            })

        }
      );


    const data =
      await response.json();


    console.log(
      "Bacs Checkout response:",
      data
    );


    if (!response.ok) {

      console.error(
        "Bacs Checkout error:",
        data.error
      );


      alert(
        data.error ||
        "Something went wrong while preparing Bacs Direct Debit."
      );


      return;

    }


    // =============================
    // REDIRECT TO STRIPE
    // =============================

    if (!data.url) {

      console.error(
        "Stripe Checkout URL missing."
      );


      alert(
        "We could not open the Bacs payment page."
      );


      return;

    }


    console.log(
      "Redirecting to Stripe Checkout..."
    );


    window.location.href =
      data.url;


  } catch (err) {

    console.error(
      "Bacs Checkout request failed:",
      err
    );


    alert(
      "Something went wrong while preparing Bacs Direct Debit."
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


    // =============================
    // MAKE SURE STRIPE OPTIONS
    // HAVE LOADED
    // =============================

    if (
      !donationOptionsReady
    ) {

      alert(
        "Donation options are still loading. Please try again in a moment."
      );


      return;

    }


    // =============================
    // CURRENT PAYMENT METHOD
    // =============================

    const paymentMethod =
      getPaymentMethod();


    console.log(
      "Selected payment method:",
      paymentMethod
    );


    // =================================================
    // SECOND CLICK — CARD
    // =================================================

    if (
      paymentMethod === "card" &&
      paymentReady
    ) {

      submitButton.disabled =
        true;


      submitButton.textContent =
        "Processing...";


      await createMonthlySubscription();


      submitButton.disabled =
        false;


      submitButton.textContent =
        "Start Monthly Donation";


      return;

    }


    // =================================================
    // RESET ERRORS
    // =================================================

    inputs.forEach(input => {

      input.classList.remove(
        "input-error"
      );

    });


    // =================================================
    // REQUIRED INPUTS
    // =================================================

    let valid =
      true;


    inputs.forEach(input => {

      if (
        input.type !== "checkbox" &&
        input.type !== "radio" &&
        !input.value.trim()
      ) {

        input.classList.add(
          "input-error"
        );


        valid =
          false;

      }

    });


    // =================================================
    // EMAIL VALIDATION
    // =================================================

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


      valid =
        false;

    }


    // =================================================
    // START DATE
    // =================================================

    if (
      !startDateSelect.value
    ) {

      startDateSelect.classList.add(
        "input-error"
      );


      valid =
        false;

    }


    // =================================================
    // STOP IF INVALID
    // =================================================

    if (!valid) {

      console.log(
        "Form validation failed."
      );


      return;

    }


    // =================================================
    // BACS DIRECT DEBIT
    // =================================================

    if (
      paymentMethod === "bacs_debit"
    ) {

      submitButton.disabled =
        true;


      submitButton.textContent =
        "Preparing Bacs Payment...";


      await createBacsCheckout();


      submitButton.disabled =
        false;


      submitButton.textContent =
        "Continue To Payment";


      return;

    }


    // =================================================
    // CARD — FIRST CLICK
    // =================================================

    submitButton.disabled =
      true;


    submitButton.textContent =
      "Preparing Payment...";


    const ready =
      await setupStripe();


    submitButton.disabled =
      false;


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

  }
);


// =============================
// LOAD STRIPE DONATION OPTIONS
// =============================
// Run once when the page loads.
// =============================

loadDonationOptions();