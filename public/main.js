// =============================
// STRIPE INIT
// =============================

const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const stripe = Stripe(
  isLocal
    ? "pk_test_51TYkg6EPmNke8msB4Yvsmr1Wg12tWt8DDu23mv12X1WuV2T0WvoZwUDLzuldsSa73v1jVMwwrNx1TkXGq3fSmKdb00YBQ7YEJC"
    : "pk_live_51SiKvVCAoHPyyMUZQyt8UANqZEEpXnn5fFehtcCzeVeu58ISRfRncPZNRpseByTp7NS5AHzyAnSW7YptWGM5MwBd00AK3pD3vB"
);

console.log(
  "Stripe mode:",
  isLocal ? "TEST" : "LIVE"
);

console.log("JS is connected and running");

// =============================
// API URL
// =============================

const API_URL =
  isLocal
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
let oneOffPaymentData = null;

let paymentReady = false;

// =============================
// STRIPE DONATION OPTIONS
// =============================

let monthlyPriceMap = {};
let oneOffPriceMap = {};

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

const startDateContainer =
  document.getElementById(
    "start-date-container"
  );

const donationFrequencyInputs =
  document.querySelectorAll(
    'input[name="donation-frequency"]'
  );

const form =
  document.querySelector("form");

const submitButton =
  form.querySelector(
    'button[type="submit"]'
  );

const inputs =
  document.querySelectorAll("input");

// =============================
// SUCCESS MODAL
// =============================

const successModal =
  document.getElementById(
    "success-modal"
  );

const successModalTitle =
  document.getElementById(
    "success-modal-title"
  );

const successModalMessage =
  document.getElementById(
    "success-modal-message"
  );

const successModalClose =
  document.getElementById(
    "success-modal-close"
  );

const successModalDone =
  document.getElementById(
    "success-modal-done"
  );

const successModalOverlay =
  document.querySelector(
    ".success-modal-overlay"
  );

function showSuccessModal(
  title,
  message
) {

  if (
    !successModal ||
    !successModalTitle ||
    !successModalMessage
  ) {

    return;

  }

  successModalTitle.textContent =
    title;

  successModalMessage.textContent =
    message;

  successModal.hidden =
    false;

  document.body.style.overflow =
    "hidden";

  if (successModalDone) {

    setTimeout(
      () => {

        successModalDone.focus();

      },
      0
    );

  }

}

function hideSuccessModal() {

  if (!successModal) {

    return;

  }

  successModal.hidden =
    true;

  document.body.style.overflow =
    "";

}

if (successModalClose) {

  successModalClose.addEventListener(
    "click",
    hideSuccessModal
  );

}

if (successModalDone) {

  successModalDone.addEventListener(
    "click",
    hideSuccessModal
  );

}

if (successModalOverlay) {

  successModalOverlay.addEventListener(
    "click",
    hideSuccessModal
  );

}

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape" &&
      successModal &&
      !successModal.hidden
    ) {

      hideSuccessModal();

    }

  }
);

// =============================
// ONE-OFF AMOUNT INPUT
// =============================

let oneOffAmountInput = null;

// =============================
// PAYMENT METHOD ELEMENTS
// =============================

const paymentPlaceholder =
  document.querySelector(
    ".payment-placeholder"
  );

const paymentMethodInputs =
  document.querySelectorAll(
    'input[name="payment-method"]'
  );

const bacsPaymentInput =
  document.querySelector(
    'input[name="payment-method"][value="bacs_debit"]'
  );

// =============================
// CREATE ONE-OFF AMOUNT INPUT
// =============================

function createOneOffAmountInput() {

  if (
    oneOffAmountInput ||
    !amountSelect
  ) {

    return;

  }

  oneOffAmountInput =
    document.createElement(
      "input"
    );

  oneOffAmountInput.type =
    "number";

  oneOffAmountInput.id =
    "one-off-amount";

  oneOffAmountInput.name =
    "one-off-amount";

  oneOffAmountInput.inputMode =
    "decimal";

  oneOffAmountInput.step =
    "0.01";

  oneOffAmountInput.placeholder =
    "Enter amount";

  oneOffAmountInput.className =
    amountSelect.className;

  oneOffAmountInput.style.display =
    "none";

  oneOffAmountInput.disabled =
    true;

  amountSelect.insertAdjacentElement(
    "afterend",
    oneOffAmountInput
  );

  oneOffAmountInput.addEventListener(
    "input",
    () => {

      oneOffAmountInput.classList.remove(
        "input-error"
      );

      if (
        getDonationFrequency() ===
          "one_off" &&
        paymentReady
      ) {

        resetStripe(false);

        updatePaymentMethodUI();

      }

    }
  );

}

createOneOffAmountInput();

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
// GET DONATION FREQUENCY
// =============================

function getDonationFrequency() {

  const selected =
    document.querySelector(
      'input[name="donation-frequency"]:checked'
    );

  return selected
    ? selected.value
    : "monthly";

}

// =============================
// GET CURRENT PRICE MAP
// =============================

function getCurrentPriceMap() {

  const frequency =
    getDonationFrequency();

  if (
    frequency === "one_off"
  ) {

    return oneOffPriceMap;

  }

  return monthlyPriceMap;

}

// =============================
// GET CURRENT PAYMENT BUTTON TEXT
// =============================

function getReadyButtonText() {

  const frequency =
    getDonationFrequency();

  if (
    frequency === "one_off"
  ) {

    return "Make One-off Donation";

  }

  return "Start Monthly Donation";

}

// =============================
// GET ONE-OFF PRICE CONFIG
// =============================

function getOneOffPriceConfig(
  selectedCause
) {

  const prices =
    oneOffPriceMap[
      selectedCause
    ];

  if (
    !Array.isArray(prices) ||
    prices.length === 0
  ) {

    return null;

  }

  const customPrice =
    prices.find(
      price =>
        price.customUnitAmount
    );

  if (
    customPrice
  ) {

    return customPrice;

  }

  return prices[0];

}

// =============================
// UPDATE DONATION FREQUENCY UI
// =============================

function updateDonationFrequencyUI() {

  const frequency =
    getDonationFrequency();

  // =============================
  // ONE-OFF
  // =============================

  if (
    frequency === "one_off"
  ) {

    if (startDateContainer) {

      startDateContainer.style.display =
        "none";

    }

    if (startDateSelect) {

      startDateSelect.value = "";

      startDateSelect.classList.remove(
        "input-error"
      );

    }

    if (bacsPaymentInput) {

      bacsPaymentInput.disabled =
        true;

      if (
        bacsPaymentInput.checked
      ) {

        const cardInput =
          document.querySelector(
            'input[name="payment-method"][value="card"]'
          );

        if (cardInput) {

          cardInput.checked =
            true;

        }

      }

    }

    return;

  }

  // =============================
  // MONTHLY
  // =============================

  if (startDateContainer) {

    startDateContainer.style.display =
      "";

  }

  if (bacsPaymentInput) {

    bacsPaymentInput.disabled =
      false;

  }

}

// =============================
// UPDATE PAYMENT METHOD UI
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

  if (
    paymentReady
  ) {

    submitButton.textContent =
      getReadyButtonText();

  } else {

    submitButton.textContent =
      "Continue To Payment";

  }

}

// =============================
// PAYMENT METHOD CHANGE
// =============================

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
// DONATION FREQUENCY CHANGE
// =============================

donationFrequencyInputs.forEach(
  input => {

    input.addEventListener(
      "change",
      () => {

        console.log(
          "Donation frequency changed:",
          input.value
        );

        resetStripe(false);

        updateDonationFrequencyUI();

        if (
          causeSelect.value
        ) {

          populateAmountControl(
            causeSelect.value
          );

        } else {

          amountSelect.innerHTML = `
            <option value="" disabled selected>
              Select an amount
            </option>
          `;

          amountSelect.disabled =
            true;

          if (
            oneOffAmountInput
          ) {

            oneOffAmountInput.value =
              "";

            oneOffAmountInput.disabled =
              true;

            oneOffAmountInput.style.display =
              "none";

          }

        }

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

    try {

      paymentElement.destroy();

    } catch (err) {

      console.warn(
        "Stripe Payment Element was already destroyed.",
        err
      );

    }

    paymentElement = null;

  }

  elements = null;

  monthlySetupData = null;

  oneOffPaymentData = null;

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
// RESET FORM AFTER SUCCESS
// =============================

function resetDonationForm() {

  resetStripe(false);

  form.reset();

  causeSelect.value = "";
  causeSelect.selectedIndex = 0;

  amountSelect.innerHTML = `
    <option value="" disabled selected>
      Select an amount
    </option>
  `;

  amountSelect.disabled =
    true;

  amountSelect.style.display =
    "";

  if (oneOffAmountInput) {

    oneOffAmountInput.value =
      "";

    oneOffAmountInput.disabled =
      true;

    oneOffAmountInput.style.display =
      "none";

    oneOffAmountInput.classList.remove(
      "input-error"
    );

    oneOffAmountInput.dataset.priceId =
      "";

  }

  const monthlyInput =
    document.querySelector(
      'input[name="donation-frequency"][value="monthly"]'
    );

  if (monthlyInput) {

    monthlyInput.checked =
      true;

  }

  const cardInput =
    document.querySelector(
      'input[name="payment-method"][value="card"]'
    );

  if (cardInput) {

    cardInput.checked =
      true;

  }

  if (startDateSelect) {

    startDateSelect.value =
      "";

    startDateSelect.classList.remove(
      "input-error"
    );

  }

  updateDonationFrequencyUI();

  updatePaymentMethodUI();

  submitButton.disabled =
    false;

  submitButton.textContent =
    "Continue To Payment";

}

// =============================
// MOUNT STRIPE PAYMENT ELEMENT
// =============================

async function mountPaymentElement(
  clientSecret
) {

  if (!clientSecret) {

    throw new Error(
      "Missing Stripe client secret."
    );

  }

  if (paymentElement) {

    try {

      paymentElement.destroy();

    } catch (err) {

      console.warn(
        "Existing Stripe Payment Element was already destroyed.",
        err
      );

    }

    paymentElement = null;

  }

  elements =
    stripe.elements({
      clientSecret
    });

  paymentElement =
    elements.create(
      "payment"
    );

  await new Promise(
    (resolve, reject) => {

      let settled = false;

      paymentElement.on(
        "ready",
        () => {

          if (settled) {
            return;
          }

          settled = true;

          console.log(
            "Stripe Payment Element is ready."
          );

          resolve();

        }
      );

      paymentElement.on(
        "loaderror",
        event => {

          if (settled) {
            return;
          }

          settled = true;

          console.error(
            "Stripe Payment Element load error:",
            event
          );

          reject(
            new Error(
              "The Stripe Payment Element could not be loaded."
            )
          );

        }
      );

      paymentElement.mount(
        "#payment-element"
      );

    }
  );

  paymentReady =
    true;

}

// =============================
// LOAD DONATION OPTIONS
// =============================

async function loadDonationOptions() {

  try {

    console.log(
      "Loading donation options from Stripe..."
    );

    causeSelect.disabled =
      true;

    amountSelect.disabled =
      true;

    if (
      oneOffAmountInput
    ) {

      oneOffAmountInput.disabled =
        true;

    }

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

    monthlyPriceMap = {};

    oneOffPriceMap = {};

    causeSelect.innerHTML = `
      <option value="" disabled>
        Select a cause
      </option>
    `;

    amountSelect.innerHTML = `
      <option value="" disabled selected>
        Select an amount
      </option>
    `;

    amountSelect.style.display =
      "";

    if (
      oneOffAmountInput
    ) {

      oneOffAmountInput.value =
        "";

      oneOffAmountInput.style.display =
        "none";

      oneOffAmountInput.disabled =
        true;

    }

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
        // MONTHLY PRICE MAP
        // =============================

        monthlyPriceMap[
          product.name
        ] = {};

        product.monthlyPrices.forEach(
          price => {

            const amount =
              price.amount / 100;

            monthlyPriceMap[
              product.name
            ][amount] =
              price.id;

          }
        );

        // =============================
        // ONE-OFF PRICE MAP
        // =============================

        oneOffPriceMap[
          product.name
        ] =
          product.oneOffPrices || [];

      }
    );

    causeSelect.selectedIndex =
      0;

    amountSelect.selectedIndex =
      0;

    causeSelect.disabled =
      false;

    amountSelect.disabled =
      true;

    donationOptionsReady =
      true;

    console.log(
      "Donation options successfully loaded."
    );

    console.log(
      "Monthly price map:",
      monthlyPriceMap
    );

    console.log(
      "One-off price map:",
      oneOffPriceMap
    );

  } catch (err) {

    console.error(
      "Failed to load donation options:",
      err
    );

    donationOptionsReady =
      false;

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

    if (
      oneOffAmountInput
    ) {

      oneOffAmountInput.disabled =
        true;

      oneOffAmountInput.style.display =
        "none";

    }

    alert(
      "We could not load the available donation options. Please refresh the page and try again."
    );

  }

}

// =============================
// POPULATE AMOUNT CONTROL
// =============================

function populateAmountControl(
  selectedCause
) {

  const frequency =
    getDonationFrequency();

  // =============================
  // MONTHLY
  // =============================

  if (
    frequency === "monthly"
  ) {

    amountSelect.style.display =
      "";

    amountSelect.innerHTML = `
      <option value="" disabled selected>
        Select an amount
      </option>
    `;

    amountSelect.disabled =
      true;

    if (
      oneOffAmountInput
    ) {

      oneOffAmountInput.value =
        "";

      oneOffAmountInput.disabled =
        true;

      oneOffAmountInput.style.display =
        "none";

    }

    if (
      !selectedCause
    ) {

      return;

    }

    const prices =
      monthlyPriceMap[
        selectedCause
      ];

    if (
      !prices ||
      Object.keys(prices).length === 0
    ) {

      amountSelect.innerHTML = `
        <option value="" disabled selected>
          No amounts available
        </option>
      `;

      return;

    }

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

    amountSelect.disabled =
      false;

    return;

  }

  // =============================
  // ONE-OFF
  // =============================

  amountSelect.style.display =
    "none";

  amountSelect.disabled =
    true;

  if (
    !oneOffAmountInput
  ) {

    createOneOffAmountInput();

  }

  oneOffAmountInput.style.display =
    "";

  oneOffAmountInput.disabled =
    true;

  oneOffAmountInput.value =
    "";

  oneOffAmountInput.classList.remove(
    "input-error"
  );

  oneOffAmountInput.removeAttribute(
    "min"
  );

  oneOffAmountInput.removeAttribute(
    "max"
  );

  oneOffAmountInput.removeAttribute(
    "title"
  );

  oneOffAmountInput.dataset.priceId =
    "";

  if (
    !selectedCause
  ) {

    return;

  }

  const price =
    getOneOffPriceConfig(
      selectedCause
    );

  if (
    !price
  ) {

    oneOffAmountInput.placeholder =
      "No amount available";

    return;

  }

  // =============================
  // CUSTOM STRIPE PRICE
  // =============================

  if (
    price.customUnitAmount
  ) {

    const custom =
      price.customUnitAmount;

    const minimum =
      Number(
        custom.minimum
      ) / 100;

    const maximum =
      Number(
        custom.maximum
      ) / 100;

    const preset =
      custom.preset !== null &&
      custom.preset !== undefined
        ? Number(
            custom.preset
          ) / 100
        : minimum;

    oneOffAmountInput.min =
      minimum;

    oneOffAmountInput.max =
      maximum;

    oneOffAmountInput.step =
      "0.01";

    oneOffAmountInput.value =
      preset.toFixed(2);

    oneOffAmountInput.placeholder =
      "Enter amount";

    oneOffAmountInput.disabled =
      false;

    oneOffAmountInput.dataset.priceId =
      price.id;

    oneOffAmountInput.title =
      `Minimum £${minimum.toFixed(
        2
      )} · Maximum £${maximum.toFixed(
        2
      )}`;

    console.log(
      "One-off custom amount configuration:",
      {
        priceId: price.id,
        minimum,
        maximum,
        preset
      }
    );

    return;

  }

  // =============================
  // FIXED ONE-OFF PRICE
  // =============================

  if (
    price.amount !== null &&
    price.amount !== undefined
  ) {

    const fixedAmount =
      Number(
        price.amount
      ) / 100;

    oneOffAmountInput.min =
      fixedAmount;

    oneOffAmountInput.max =
      fixedAmount;

    oneOffAmountInput.step =
      "0.01";

    oneOffAmountInput.value =
      fixedAmount.toFixed(2);

    oneOffAmountInput.disabled =
      true;

    oneOffAmountInput.dataset.priceId =
      price.id;

    oneOffAmountInput.title =
      `Fixed donation amount: £${fixedAmount.toFixed(
        2
      )}`;

    return;

  }

  // =============================
  // INVALID PRICE
  // =============================

  oneOffAmountInput.placeholder =
    "No valid amount available";

}

// =============================
// CAUSE CHANGE
// =============================

causeSelect.addEventListener(
  "change",
  () => {

    const selectedCause =
      causeSelect.value;

    resetStripe(false);

    populateAmountControl(
      selectedCause
    );

    updatePaymentMethodUI();

  }
);

// =============================
// INITIAL PAYMENT UI
// =============================

updatePaymentMethodUI();
updateDonationFrequencyUI();

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

  const frequency =
    getDonationFrequency();

  let donationAmount =
    0;

  let selectedPriceId =
    null;

  // =============================
  // MONTHLY
  // =============================

  if (
    frequency === "monthly"
  ) {

    donationAmount =
      Number(
        amountSelect.value
      );

    selectedPriceId =
      monthlyPriceMap?.[
        cause
      ]?.[
        donationAmount
      ];

  }

  // =============================
  // ONE-OFF
  // =============================

  else {

    donationAmount =
      Number(
        oneOffAmountInput
          ? oneOffAmountInput.value
          : 0
      );

    const oneOffPrice =
      getOneOffPriceConfig(
        cause
      );

    selectedPriceId =
      oneOffPrice
        ? oneOffPrice.id
        : null;

  }

  const startDate =
    Number(
      startDateSelect.value
    );

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
// SETUP MONTHLY CARD PAYMENT
// =============================

async function setupMonthlyStripe() {

  try {

    const donationData =
      getDonationData();

    console.log(
      "Preparing monthly Card donation..."
    );

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
      "Selected monthly price ID:",
      donationData.priceId
    );

    if (!donationData.priceId) {

      console.error(
        "No monthly price ID found for selection."
      );

      alert(
        "We could not find the selected monthly donation price."
      );

      return false;

    }

    resetStripe();

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
      "Monthly backend response:",
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

      alert(
        "Stripe did not return a payment setup key."
      );

      return false;

    }

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

    await mountPaymentElement(
      data.setupClientSecret
    );

    submitButton.textContent =
      "Start Monthly Donation";

    console.log(
      "Monthly payment form is ready."
    );

    return true;

  } catch (err) {

    console.error(
      "Monthly Stripe setup error:",
      err
    );

    resetStripe(false);

    alert(
      "Something went wrong while setting up the monthly payment."
    );

    return false;

  }

}

// =============================
// SETUP ONE-OFF CARD PAYMENT
// =============================

async function setupOneOffStripe() {

  try {

    const donationData =
      getDonationData();

    console.log(
      "Preparing one-off Card donation..."
    );

    console.log(
      "Selected cause:",
      donationData.donationCause
    );

    console.log(
      "Selected amount:",
      donationData.donationAmount
    );

    console.log(
      "Selected one-off price ID:",
      donationData.priceId
    );

    if (!donationData.priceId) {

      console.error(
        "No one-off price ID found for selection."
      );

      alert(
        "We could not find the selected one-off donation price."
      );

      return false;

    }

    if (
      !Number.isFinite(
        donationData.donationAmount
      ) ||
      donationData.donationAmount <= 0
    ) {

      alert(
        "Please enter a valid one-off donation amount."
      );

      if (
        oneOffAmountInput
      ) {

        oneOffAmountInput.classList.add(
          "input-error"
        );

        oneOffAmountInput.focus();

      }

      return false;

    }

    resetStripe();

    const res =
      await fetch(
        `${API_URL}/create-one-off-payment`,
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

              donationAmount:
                donationData.donationAmount,

              giftAid:
                donationData.giftAid,

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

              donationCause:
                donationData.donationCause

            })

        }
      );

    const data =
      await res.json();

    console.log(
      "One-off backend response:",
      data
    );

    if (!res.ok) {

      console.error(
        "One-off backend error:",
        data.error
      );

      alert(
        data.error ||
        "Something went wrong while preparing your one-off donation."
      );

      return false;

    }

    if (
      data.mode !== "payment"
    ) {

      console.error(
        "Unexpected Stripe payment response."
      );

      alert(
        "Something went wrong while preparing your one-off donation."
      );

      return false;

    }

    if (
      !data.clientSecret
    ) {

      console.error(
        "Missing PaymentIntent client secret."
      );

      alert(
        "Stripe did not return a payment key."
      );

      return false;

    }

    oneOffPaymentData = {

      paymentIntentId:
        data.paymentIntentId,

      customerId:
        data.customerId,

      priceId:
        data.priceId,

      amount:
        data.amount

    };

    await mountPaymentElement(
      data.clientSecret
    );

    submitButton.textContent =
      "Make One-off Donation";

    console.log(
      "One-off payment form is ready."
    );

    return true;

  } catch (err) {

    console.error(
      "One-off Stripe setup error:",
      err
    );

    resetStripe(false);

    alert(
      "Something went wrong while setting up the one-off payment."
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

      return false;

    }

    console.log(
      "Payment method saved."
    );

    console.log(
      "SetupIntent:",
      setupIntent
    );

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

      return false;

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
    // SUCCESS MODAL
    // =============================

    const donationData =
      getDonationData();

    const amount =
      Number(
        donationData.donationAmount
      ).toFixed(2);

    const cause =
      donationData.donationCause;

    showSuccessModal(
      "Subscription successful",
      `Your £${amount} monthly donation to ${cause} has been set up successfully.`
    );

    resetDonationForm();

    return true;

  } catch (err) {

    console.error(
      "Subscription request failed:",
      err
    );

    alert(
      "Something went wrong while creating your monthly donation."
    );

    return false;

  }

}

// =============================
// CREATE ONE-OFF CARD PAYMENT
// =============================

async function createOneOffPayment() {

  try {

    console.log(
      "Confirming one-off Card payment..."
    );

    if (
      !elements ||
      !paymentElement ||
      !paymentReady
    ) {

      console.error(
        "Stripe Payment Element is not ready.",
        {
          elements,
          paymentElement,
          paymentReady
        }
      );

      alert(
        "The payment form is not ready yet. Please wait a moment and try again."
      );

      return false;

    }

    const {
      error,
      paymentIntent
    } =
      await stripe.confirmPayment({

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
        "One-off payment error:",
        error.message
      );

      alert(
        error.message
      );

      return false;

    }

    console.log(
      "One-off PaymentIntent:",
      paymentIntent
    );

    // =============================
    // SUCCESS
    // =============================

    if (
      paymentIntent &&
      paymentIntent.status ===
        "succeeded"
    ) {

      console.log(
        "One-off payment succeeded:",
        paymentIntent.id
      );

      const donationData =
        getDonationData();

      const amount =
        Number(
          donationData.donationAmount
        ).toFixed(2);

      const cause =
        donationData.donationCause;

      showSuccessModal(
        "Donation successful",
        `Your £${amount} one-off donation to ${cause} has been processed successfully.`
      );

      resetDonationForm();

      return true;

    }

    // =============================
    // PAYMENT REQUIRES ACTION
    // =============================

    if (
      paymentIntent &&
      (
        paymentIntent.status ===
          "processing" ||
        paymentIntent.status ===
          "requires_action"
      )
    ) {

      console.log(
        "One-off payment is still processing:",
        paymentIntent.status
      );

      alert(
        "Your payment is being processed. Please check the payment status before making another donation."
      );

      window.location.href =
        "/";

      return true;

    }

    // =============================
    // UNEXPECTED STATUS
    // =============================

    console.error(
      "Unexpected PaymentIntent status:",
      paymentIntent
        ? paymentIntent.status
        : "unknown"
    );

    alert(
      "We could not confirm the payment status. Please check Stripe before attempting the donation again."
    );

    return false;

  } catch (err) {

    console.error(
      "One-off payment request failed:",
      err
    );

    alert(
      "Something went wrong while processing the one-off donation."
    );

    return false;

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

    if (!donationData.priceId) {

      console.error(
        "No price ID found for Bacs donation."
      );

      alert(
        "We could not find the selected donation price."
      );

      return false;

    }

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

      return false;

    }

    if (!data.url) {

      console.error(
        "Stripe Checkout URL missing."
      );

      alert(
        "We could not open the Bacs payment page."
      );

      return false;

    }

    console.log(
      "Redirecting to Stripe Checkout..."
    );

    window.location.href =
      data.url;

    return true;

  } catch (err) {

    console.error(
      "Bacs Checkout request failed:",
      err
    );

    alert(
      "Something went wrong while preparing Bacs Direct Debit."
    );

    return false;

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
    // CURRENT SETTINGS
    // =============================

    const paymentMethod =
      getPaymentMethod();

    const donationFrequency =
      getDonationFrequency();

    console.log(
      "Selected payment method:",
      paymentMethod
    );

    console.log(
      "Selected donation frequency:",
      donationFrequency
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

      if (
        donationFrequency === "one_off"
      ) {

        await createOneOffPayment();

      } else {

        await createMonthlySubscription();

      }

      /*
       * The success functions reset
       * the button themselves.
       *
       * If payment failed, restore
       * the correct button state.
       */

      if (paymentReady) {

        submitButton.disabled =
          false;

        submitButton.textContent =
          getReadyButtonText();

      }

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

    if (
      oneOffAmountInput
    ) {

      oneOffAmountInput.classList.remove(
        "input-error"
      );

    }

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
    // DONATION CAUSE
    // =================================================

    if (
      !causeSelect.value
    ) {

      causeSelect.classList.add(
        "input-error"
      );

      valid =
        false;

    }

    // =================================================
    // DONATION AMOUNT
    // =================================================

    if (
      donationFrequency ===
      "one_off"
    ) {

      const enteredAmount =
        Number(
          oneOffAmountInput
            ? oneOffAmountInput.value
            : 0
        );

      const oneOffPrice =
        getOneOffPriceConfig(
          causeSelect.value
        );

      if (
        !Number.isFinite(
          enteredAmount
        ) ||
        enteredAmount <= 0
      ) {

        if (
          oneOffAmountInput
        ) {

          oneOffAmountInput.classList.add(
            "input-error"
          );

        }

        valid =
          false;

      } else if (
        oneOffPrice &&
        oneOffPrice.customUnitAmount
      ) {

        const minimum =
          Number(
            oneOffPrice.customUnitAmount.minimum
          ) / 100;

        const maximum =
          Number(
            oneOffPrice.customUnitAmount.maximum
          ) / 100;

        if (
          enteredAmount < minimum ||
          enteredAmount > maximum
        ) {

          if (
            oneOffAmountInput
          ) {

            oneOffAmountInput.classList.add(
              "input-error"
            );

          }

          alert(
            `Please enter an amount between £${minimum.toFixed(
              2
            )} and £${maximum.toFixed(
              2
            )}.`
          );

          valid =
            false;

        }

      } else if (
        oneOffPrice &&
        oneOffPrice.amount !== null &&
        oneOffPrice.amount !== undefined
      ) {

        const fixedAmount =
          Number(
            oneOffPrice.amount
          ) / 100;

        if (
          enteredAmount !==
          fixedAmount
        ) {

          if (
            oneOffAmountInput
          ) {

            oneOffAmountInput.classList.add(
              "input-error"
            );

          }

          valid =
            false;

        }

      }

    } else {

      if (
        !amountSelect.value
      ) {

        amountSelect.classList.add(
          "input-error"
        );

        valid =
          false;

      }

    }

    // =================================================
    // START DATE
    // =================================================

    if (
      donationFrequency === "monthly" &&
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

      if (
        donationFrequency !== "monthly"
      ) {

        alert(
          "One-off Bacs payments are not available yet. Please select Card for a one-off donation."
        );

        return;

      }

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

    let ready =
      false;

    // =================================================
    // MONTHLY CARD
    // =================================================

    if (
      donationFrequency === "monthly"
    ) {

      ready =
        await setupMonthlyStripe();

    }

    // =================================================
    // ONE-OFF CARD
    // =================================================

    else {

      ready =
        await setupOneOffStripe();

    }

    submitButton.disabled =
      false;

    if (!ready) {

      console.error(
        "Stripe payment setup failed."
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

loadDonationOptions();