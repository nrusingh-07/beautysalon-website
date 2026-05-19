const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_CODE = process.env.ADMIN_CODE || "grace2026";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");

const services = [
  {
    id: "hair-spa",
    name: "Signature Hair Spa",
    category: "Hair Care",
    duration: "75 min",
    price: 2499,
    description: "Deep repair treatment with scalp massage, steam therapy, and luminous finish."
  },
  {
    id: "bridal-glow",
    name: "Bridal Glow Ritual",
    category: "Skin",
    duration: "120 min",
    price: 5499,
    description: "A radiance-focused facial, de-tan polish, and calming mask for event-ready skin."
  },
  {
    id: "cut-style",
    name: "Cut, Style & Finish",
    category: "Hair Styling",
    duration: "60 min",
    price: 1499,
    description: "Consultation-led haircut with blow dry styling and finishing serum."
  },
  {
    id: "nail-luxe",
    name: "Luxe Nail Studio",
    category: "Nails",
    duration: "80 min",
    price: 1999,
    description: "Manicure, gel color, nail shaping, cuticle care, and hand hydration."
  },
  {
    id: "makeup",
    name: "Occasion Makeup",
    category: "Makeup",
    duration: "90 min",
    price: 3999,
    description: "Soft glam, party, or editorial makeup tailored to your outfit and skin tone."
  },
  {
    id: "brow-lash",
    name: "Brow & Lash Edit",
    category: "Beauty Bar",
    duration: "45 min",
    price: 999,
    description: "Brow shaping, tint consultation, lash lift prep, and eye-area finishing."
  }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(BOOKINGS_FILE)) {
    fs.writeFileSync(BOOKINGS_FILE, "[]\n");
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
  });
}

function readBookings() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf8"));
}

function writeBookings(bookings) {
  ensureDataFile();
  fs.writeFileSync(BOOKINGS_FILE, `${JSON.stringify(bookings, null, 2)}\n`);
}

function isFutureDate(dateValue) {
  const appointmentDate = new Date(`${dateValue}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(appointmentDate.getTime()) && appointmentDate >= today;
}

function validateBooking(payload) {
  const required = ["name", "phone", "service", "date", "time"];
  const missing = required.filter((field) => !String(payload[field] || "").trim());

  if (missing.length) {
    return `Please fill ${missing.join(", ")}.`;
  }

  if (!services.some((service) => service.id === payload.service)) {
    return "Please choose a valid service.";
  }

  if (!isFutureDate(payload.date)) {
    return "Please choose today or a future date.";
  }

  if (!/^\d{2}:\d{2}$/.test(payload.time)) {
    return "Please choose a valid time.";
  }

  if (!/^[+\d\s()-]{7,20}$/.test(payload.phone)) {
    return "Please enter a valid phone number.";
  }

  return "";
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/services") {
    sendJson(response, 200, { services });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/bookings") {
    if (url.searchParams.get("code") !== ADMIN_CODE) {
      sendJson(response, 401, { error: "Admin code is required." });
      return true;
    }

    const bookings = readBookings().sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    sendJson(response, 200, { bookings });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/bookings") {
    try {
      const payload = await parseBody(request);
      const error = validateBooking(payload);

      if (error) {
        sendJson(response, 400, { error });
        return true;
      }

      const service = services.find((item) => item.id === payload.service);
      const bookings = readBookings();
      const booking = {
        id: crypto.randomUUID(),
        name: String(payload.name).trim(),
        phone: String(payload.phone).trim(),
        email: String(payload.email || "").trim(),
        serviceId: service.id,
        serviceName: service.name,
        date: payload.date,
        time: payload.time,
        notes: String(payload.notes || "").trim(),
        status: "New",
        createdAt: new Date().toISOString()
      };

      bookings.push(booking);
      writeBookings(bookings);
      sendJson(response, 201, { booking });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Unable to create booking." });
    }
    return true;
  }

  return false;
}

function serveStatic(request, response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    response.end(content);
  });
}

ensureDataFile();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(request, response, url);
    if (!handled) {
      sendJson(response, 404, { error: "API route not found." });
    }
    return;
  }

  serveStatic(request, response, url);
});

server.listen(PORT, () => {
  console.log(`Beautysalon is running at http://localhost:${PORT}`);
  console.log(`Admin booking code: ${ADMIN_CODE}`);
});
