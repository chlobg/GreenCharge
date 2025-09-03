import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import polyline from "polyline";

dotenv.config();

const app = express();
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://green-charge.vercel.app",
];
const vercelPreviewRegex = /^https:\/\/.*\.vercel\.app$/;

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      if (vercelPreviewRegex.test(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

app.use(express.json());

app.get("/", (_, res) => res.send("GreenCharge API OK"));
const OFFPEAK = { start: 22, end: 6 };
const PRICES = {
  AC: { day: 0.28, night: 0.18 },
  DC: { day: 0.45, night: 0.35 },
};
const OCM_KEY = process.env.OCM_KEY || "YOUR_OCM_KEY";

const isOffpeak = (d) =>
  d.getHours() >= OFFPEAK.start || d.getHours() < OFFPEAK.end;
const priceAt = (type, date) =>
  isOffpeak(date) ? PRICES[type].night : PRICES[type].day;

app.get("/api/geocode", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "q required" });
    const url = "https://nominatim.openstreetmap.org/search";
    const { data } = await axios.get(url, {
      params: {
        q: q + ", France",
        format: "json",
        addressdetails: 1,
        limit: 1,
        countrycodes: "fr",
      },
      headers: { "User-Agent": "GreenCharge/1.0" },
    });
    if (!data?.length) return res.status(404).json({ error: "not found" });
    res.json({
      lat: +data[0].lat,
      lng: +data[0].lon,
      displayName: data[0].display_name,
    });
  } catch {
    res.status(500).json({ error: "geocode error" });
  }
});

async function getRoute(origin, destination, departAtISO) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=polyline&alternatives=false`;
  const { data } = await axios.get(url);
  const r = data.routes?.[0];
  if (!r) throw new Error("route not found");
  const coords = polyline
    .decode(r.geometry)
    .map(([lat, lng]) => ({ lat, lng }));
  const depart = departAtISO ? new Date(departAtISO) : new Date();
  return {
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    geometry: r.geometry,
    coords,
    depart,
  };
}

function haversine(a, b) {
  const R = 6371,
    dLat = ((b.lat - a.lat) * Math.PI) / 180,
    dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180,
    la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function sampleEveryNkm(coords, stepKm = 2) {
  const out = [];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = haversine(coords[i - 1], coords[i]);
    acc += d;
    if (acc >= stepKm) {
      out.push(coords[i]);
      acc = 0;
    }
  }
  if (!out.length) out.push(coords[Math.floor(coords.length / 2)]);
  return out;
}

async function fetchStationsAround({ lat, lng }, distanceKm = 1.5) {
  const { data } = await axios.get("https://api.openchargemap.io/v3/poi", {
    params: {
      output: "json",
      latitude: lat,
      longitude: lng,
      distance: distanceKm,
      distanceunit: "KM",
      maxresults: 50,
      compact: true,
      key: OCM_KEY,
    },
    headers: { "User-Agent": "GreenCharge/1.0" },
  });
  return (data || []).map((p) => {
    const maxKW = (p.Connections || [])
      .map((c) => c.PowerKW || 0)
      .reduce((m, v) => Math.max(m, v), 0);
    const type = maxKW >= 50 ? "DC" : "AC";
    return {
      id: p.ID,
      name: p.AddressInfo?.Title || "Charge point",
      lat: p.AddressInfo?.Latitude,
      lng: p.AddressInfo?.Longitude,
      powerKw: maxKW || 11,
      type,
    };
  });
}

function pickBest(stations, departDate, energyKWh, vehicleACmax = 11) {
  let best = null;
  for (const s of stations) {
    const type = s.type;
    const P = type === "AC" ? Math.min(s.powerKw, vehicleACmax) : s.powerKw;
    const tH = energyKWh / (P * 0.9);
    const nowCost = energyKWh * priceAt(type, departDate);
    const endNow = new Date(departDate.getTime() + tH * 3600 * 1000);
    let choice = {
      start: departDate,
      end: endNow,
      cost: nowCost,
      reason: "now",
      station: s,
    };
    const nextHC = new Date(departDate);
    nextHC.setHours(22, 0, 0, 0);
    if (nextHC <= departDate) nextHC.setDate(nextHC.getDate() + 1);
    const hcCost = energyKWh * priceAt(type, nextHC);
    const endHC = new Date(nextHC.getTime() + tH * 3600 * 1000);
    if (hcCost < choice.cost)
      choice = {
        start: nextHC,
        end: endHC,
        cost: hcCost,
        reason: "offpeak",
        station: s,
      };
    if (!best || choice.cost < best.cost) best = choice;
  }
  return best;
}

app.post("/api/plan", async (req, res) => {
  try {
    const {
      origin,
      destination,
      autonomyKm = 120,
      cWhPerKm = 160,
      departAtISO,
      forceCharge = false,
      topupKWh = 10,
    } = req.body;
    if (!origin || !destination)
      return res.status(400).json({ error: "origin/destination required" });

    const route = await getRoute(origin, destination, departAtISO);
    const E0 = (autonomyKm * cWhPerKm) / 1000;
    const Eneed = ((route.distanceKm * cWhPerKm) / 1000) * 1.1;
    if (E0 >= Eneed && !forceCharge) {
      return res.json({
        route: {
          distanceKm: route.distanceKm,
          durationMin: route.durationMin,
          polyline: route.geometry,
        },
        recommendation: null,
        note: "no stop needed",
      });
    }
    const deficit = +(Eneed - E0).toFixed(1);
    const Emin = deficit > 0 ? deficit : Math.max(topupKWh, 5);

    const samples = sampleEveryNkm(route.coords, 2);
    const all = [];
    for (const pt of samples) all.push(...(await fetchStationsAround(pt, 1.5)));
    const stations = Array.from(new Map(all.map((s) => [s.id, s])).values());
    if (!stations.length) return res.status(404).json({ error: "no stations" });

    const best = pickBest(stations, route.depart, Emin);
    res.json({
      route: {
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        polyline: route.geometry,
      },
      recommendation: {
        station: best.station,
        startISO: best.start.toISOString(),
        endISO: best.end.toISOString(),
        kWhToCharge: Emin,
        powerKw:
          best.station.type === "AC"
            ? Math.min(best.station.powerKw, 11)
            : best.station.powerKw,
        estimatedCostEUR: +best.cost.toFixed(2),
        reason: best.reason,
        mode: deficit > 0 ? "needed" : "topup",
      },
    });
  } catch {
    res.status(500).json({ error: "server error" });
  }
});

if (process.env.VERCEL !== "1") {
  app.listen(3001, () => console.log("http://localhost:3001"));
}
export default app;
