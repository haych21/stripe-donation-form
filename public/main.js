// =============================
// STRIPE INIT
// =============================
const stripe = Stripe("pk_test_51TYkg6EPmNke8msB4Yvsmr1Wg12tWt8DDu23mv12X1WuV2T0WvoZwUDLzuldsSa73v1jVMwwrNx1TkXGq3fSmKdb00YBQ7YEJC");

console.log("JS is connected and running");

let elements = null;
let paymentElement = null;


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
const causeSelect = document.getElementById("cause-select");
const amountSelect = document.getElementById("donation-amount");

const form = document.querySelector("form");
const inputs = document.querySelectorAll("input");


// =============================
// FREQUENCY TOGGLE
// =============================
let frequency = "monthly";

const freqButtons = document.querySelectorAll(".freq-btn");

freqButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    freqButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    frequency = btn.dataset.value;
    console.log("Selected frequency:", frequency);
  });
});


// =============================
// INPUT RESET
// =============================
inputs.forEach((input) => {
  input.addEventListener("input", () => {
    input.classList.remove("input-error");
  });
});


// =============================
// SETUP STRIPE
// =============================
async function setupStripe() {

  const emailInput = form.querySelector('input[type="email"]');

  const fullName = document.getElementById("full-name").value;
  const phone = document.getElementById("phone").value;
  const country = document.getElementById("country").value;

  const giftAidChecked = document.getElementById("gift-aid").checked;

  // =============================
  // GET CURRENT SELECTIONS
  // =============================
  const cause = causeSelect.value;
  const donationAmount = Number(amountSelect.value);

  console.log("Selected cause:", cause);
  console.log("Selected amount:", donationAmount);
  console.log("Selected frequency:", frequency);

  // =============================
  // PRICE LOOKUP
  // =============================
  let selectedPriceId = null;

  if (frequency === "monthly") {
    selectedPriceId = priceMap?.[cause]?.[donationAmount];
  }

  console.log("Selected price ID:", selectedPriceId);

  // SAFETY CHECK
  if (frequency === "monthly" && !selectedPriceId) {
    console.error("No price ID found for selection");
    return;
  }

  const res = await fetch("/create-subscription", {

    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      email: emailInput.value,
      priceId: selectedPriceId,
      giftAid: giftAidChecked,
      fullName,
      phone,
      country,
      frequency,
      donationAmount
    }),
  });

  const data = await res.json();

  console.log("Backend response:", data);

  if (!data.clientSecret) {
    console.error("Missing clientSecret");
    return;
  }

  // =============================
  // STRIPE ELEMENTS
  // =============================
  elements = stripe.elements({
    clientSecret: data.clientSecret,
  });

  paymentElement = elements.create("payment");
  paymentElement.mount("#payment-element");

  console.log("Payment Element mounted");
}


// =============================
// FORM SUBMIT
// =============================
form.addEventListener("submit", async (e) => {

  e.preventDefault();

  let valid = true;

  inputs.forEach(input => {

    input.classList.remove("input-error");

    if (input.type !== "checkbox" && !input.value.trim()) {
      input.classList.add("input-error");
      valid = false;
    }
  });

  const emailInput = form.querySelector('input[type="email"]');

  if (emailInput && !emailInput.value.includes("@")) {
    emailInput.classList.add("input-error");
    valid = false;
  }

  if (!valid) return;

  await setupStripe();
  console.log("Stripe ready");
});


// =============================
// PAY BUTTON
// =============================
document.getElementById("pay-button").addEventListener("click", async () => {

  if (!elements) {
    console.error("Stripe Elements not loaded");
    return;
  }

  const { error } = await stripe.confirmPayment({
    elements,
    confirmParams: {
      return_url: window.location.href,
    },
    redirect: "if_required",
  });

  if (error) {
    console.error("Payment error:", error.message);
  } else {
    alert("Payment successful 🎉");
  }
});