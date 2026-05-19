const state = {
  services: [],
  activeFilter: "All"
};

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const serviceGrid = document.querySelector("[data-service-grid]");
const serviceSelect = document.querySelector("[data-service-select]");
const bookingForm = document.querySelector("[data-booking-form]");
const bookingStatus = document.querySelector("[data-booking-status]");
const dateInput = document.querySelector("[data-date-input]");
const menuButton = document.querySelector("[data-menu-button]");
const nav = document.querySelector("[data-nav]");
const adminForm = document.querySelector("[data-admin-form]");
const adminList = document.querySelector("[data-admin-list]");

function todayISO() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function renderServices() {
  const visibleServices = state.activeFilter === "All"
    ? state.services
    : state.services.filter((service) => service.category === state.activeFilter);

  serviceGrid.innerHTML = visibleServices.map((service) => `
    <article class="service-card">
      <p class="eyebrow">${service.category}</p>
      <h3>${service.name}</h3>
      <p>${service.description}</p>
      <div class="service-meta">
        <span>${service.duration}</span>
        <span>${formatter.format(service.price)}</span>
      </div>
    </article>
  `).join("");
}

function populateServiceSelect() {
  const options = state.services.map((service) => (
    `<option value="${service.id}">${service.name} - ${formatter.format(service.price)}</option>`
  ));

  serviceSelect.insertAdjacentHTML("beforeend", options.join(""));
}

async function loadServices() {
  const response = await fetch("/api/services");
  const data = await response.json();
  state.services = data.services;
  renderServices();
  populateServiceSelect();
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "#8f4745" : "#496344";
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.activeFilter = button.dataset.filter;
    renderServices();
  });
});

menuButton.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

nav.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    nav.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
  }
});

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(bookingStatus, "Sending your request...");

  const payload = Object.fromEntries(new FormData(bookingForm).entries());

  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Booking failed.");
    }

    bookingForm.reset();
    dateInput.value = todayISO();
    setStatus(bookingStatus, `Booked: ${data.booking.serviceName} on ${data.booking.date} at ${data.booking.time}.`);
  } catch (error) {
    setStatus(bookingStatus, error.message, true);
  }
});

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminList.innerHTML = "<p>Loading bookings...</p>";

  const code = new FormData(adminForm).get("code");
  const response = await fetch(`/api/bookings?code=${encodeURIComponent(code)}`);
  const data = await response.json();

  if (!response.ok) {
    adminList.innerHTML = `<p>${data.error || "Unable to load bookings."}</p>`;
    return;
  }

  if (!data.bookings.length) {
    adminList.innerHTML = "<p>No bookings yet. Submit the appointment form to see the backend in action.</p>";
    return;
  }

  adminList.innerHTML = data.bookings.map((booking) => `
    <article>
      <strong>${booking.name}</strong>
      <span>${booking.serviceName}</span>
      <span>${booking.date} at ${booking.time}</span>
      <span>${booking.phone}${booking.email ? ` · ${booking.email}` : ""}</span>
      ${booking.notes ? `<span>${booking.notes}</span>` : ""}
    </article>
  `).join("");
});

dateInput.value = todayISO();
dateInput.min = todayISO();
loadServices().catch(() => {
  serviceGrid.innerHTML = "<p>Services could not be loaded.</p>";
});
