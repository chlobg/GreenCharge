import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import polyline from "polyline";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: (o, cb) => cb(null, true),
  })
);
app.use(express.json());

app.get("/", (_, res) => res.send("GreenCharge API OK"));

const OFFPEAK = { start: 22, end: 6 };
const PRICES = {
  AC: { day: 0.28, night: 0.18 },
  DC: { day: 0.45, night: 0.35 },
};
const isOffpeak = (d) =>
  d.getHours() >= OFFPEAK.start || d.getHours() < OFFPEAK.end;
const priceAt = (type, date) =>
  isOffpeak(date) ? PRICES[type].night : PRICES[type].day;

const UA = { "User-Agent": "GreenCharge/1.0 (vercel)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, { tries = 4, baseDelay = 400 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;
      // on ne retry que 429 ou 5xx
      if (!(status === 429 || (status >= 500 && status < 600))) break;
      const wait = baseDelay * Math.pow(2, i) + Math.random() * 200;
      await sleep(wait);
    }
  }
  throw lastErr;
}

function makeCache(ttlMs = 10 * 60 * 1000) {
  const m = new Map();
  return {
    async getOrSet(key, loader) {
      const now = Date.now();
      const hit = m.get(key);
      if (hit && now - hit.t < ttlMs) return hit.v;
      const v = await loader();
      m.set(key, { t: now, v });
      return v;
    },
  };
}
const geoCache = makeCache(60 * 60 * 1000);
const ocmCache = makeCache(30 * 60 * 1000);
const routeCache = makeCache(10 * 60 * 1000);

app.get("/api/geocode", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q required" });

    const key = `geo:${q.toLowerCase()}`;
    const data = await geoCache.getOrSet(key, async () => {
      const { data } = await withRetry(() =>
        axios.get("https://nominatim.openstreetmap.org/search", {
          params: {
            q: q + ", France",
            format: "json",
            addressdetails: 1,
            limit: 1,
            countrycodes: "fr",
          },
          headers: UA,
        })
      );
      if (!data?.length)
        throw Object.assign(new Error("not found"), { code: 404 });
      return {
        lat: +data[0].lat,
        lng: +data[0].lon,
        displayName: data[0].display_name,
      };
    });
    res.json(data);
  } catch (e) {
    const s = e?.code === 404 ? 404 : 500;
    res.status(s).json({ error: e?.message || "geocode error" });
  }
});

async function getRoute(origin, destination, departAtISO) {
  const key = `route:${origin.lat.toFixed(4)},${origin.lng.toFixed(
    4
  )}-${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
  return routeCache.getOrSet(key, async () => {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const { data } = await withRetry(() =>
      axios.get(url, {
        params: {
          overview: "full",
          geometries: "polyline",
          alternatives: false,
        },
        headers: UA,
      })
    );
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
  });
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
function sampleEveryNkm(coords, stepKm = 10) {
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
function dedupeByGrid(points, cellKm = 5) {
  const cellDeg = cellKm / 111;
  const set = new Set();
  const out = [];
  for (const p of points) {
    const k = `${Math.round(p.lat / cellDeg)}:${Math.round(p.lng / cellDeg)}`;
    if (!set.has(k)) {
      set.add(k);
      out.push(p);
    }
  }
  return out;
}

const OCM_KEY = process.env.OCM_KEY || "";
const OCM_BASE = "https://api.openchargemap.io/v3/poi";

async function fetchStationsAround(pt, distanceKm = 2) {
  const key = `ocm:${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}:d${distanceKm}`;
  return ocmCache.getOrSet(key, async () => {
    const { data } = await withRetry(() =>
      axios.get(OCM_BASE, {
        params: {
          output: "json",
          latitude: pt.lat,
          longitude: pt.lng,
          distance: distanceKm,
          distanceunit: "KM",
          maxresults: 40,
          compact: true,
          key: OCM_KEY || undefined,
        },
        headers: UA,
      })
    );
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
  });
}

async function mapLimit(arr, limit, fn) {
  const ret = [];
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < arr.length) {
      const idx = i++;
      ret[idx] = await fn(arr[idx], idx);
    }
  });
  await Promise.all(workers);
  return ret;
}

async function fetchStationsAlongRoute(coords) {
  const samples = dedupeByGrid(sampleEveryNkm(coords, 10), 5);
  const lists = await mapLimit(samples, 2, (pt) => fetchStationsAround(pt, 2));
  const all = lists.flat();

  return Array.from(new Map(all.map((s) => [s.id, s])).values());
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
    } = req.body || {};

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

    const stations = await fetchStationsAlongRoute(route.coords);

    if (!stations.length) {
      return res.status(429).json({ error: "rate-limited or no stations" });
    }

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
  } catch (e) {
    const status = e?.response?.status || 500;
    res.status(status).json({ error: "server error" });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`http://localhost:${port}`));
