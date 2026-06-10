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
  5: "price_1TYqQ7EPmNke8msBIru7huCa",
  15: "price_1TYqQ7EPmNke8msBVxpmWAKw",
  30: "price_1TYqQ7EPmNke8msBPi9XurhY",
};


// =============================
// GET DATA
// =============================
const params = new URLSearchParams(window.location.search);

const cause = params.get("cause") || "Palestine Emergency Aid";

// CHANGE THIS TO TEST DIFFERENT PLANS
const urlAmount = Number(params.get("amount")) || 15;

const frequency = "monthly";

console.log("Amount:", urlAmount);


// =============================
// UPDATE UI
// =============================
document.getElementById("cause").textContent = cause;

document.getElementById("amount").textContent = `£${urlAmount}`;

document.getElementById("frequency").textContent = "Monthly";


// =============================
// INPUT RESET
// =============================
const inputs = document.querySelectorAll("input");

inputs.forEach((input) => {
  input.addEventListener("input", () => {
    input.classList.remove("input-error");
  });
});


// =============================
// FORM
// =============================
const form = document.querySelector("form");


// =============================
// SETUP STRIPE
// =============================
async function setupStripe() {

  const emailInput = 
  form.querySelector('input[type="email"]');
  
  const fullName =
  document.getElementById("full-name").value;

const phone =
  document.getElementById("phone").value;

const country =
  document.getElementById("country").value;


    // GIFT AID CHECKBOX
  const giftAidChecked =
  document.getElementById("gift-aid").checked;

  const selectedPriceId = priceMap[urlAmount];

  console.log("Selected price ID:", selectedPriceId);

  const res = await fetch("http://localhost:3000/create-subscription", {

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
    }),
  });

  const data = await res.json();

  console.log("Backend response:", data);

  // IMPORTANT
  if (!data.clientSecret) {
    console.error("Missing clientSecret");
    return;
  }

  // CREATE ELEMENTS
  elements = stripe.elements({
    clientSecret: data.clientSecret,
  });

  // CREATE PAYMENT ELEMENT
  paymentElement = elements.create("payment");

  // MOUNT PAYMENT ELEMENT
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

  // SHOW PAYMENT ELEMENT
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

    alert("Subscription started 🎉");
  }
});