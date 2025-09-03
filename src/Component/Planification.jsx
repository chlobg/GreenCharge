import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import polyline from "polyline";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
const api = (p) => (API_BASE ? `${API_BASE}${p}` : p);

function GreenChargeLogo() {
  return (
    <div className="flex items-center gap-2">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        className="text-green-600"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4v4M17 4v4" />
        <rect x="5" y="8" width="14" height="12" rx="4" />
      </svg>
      <span className="tracking-[0.14em] font-extrabold text-[#18324B]">
        GREENCHARGE
      </span>
    </div>
  );
}

async function getJSON(url, options) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(options?.headers || {}) },
    ...options,
  });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json")
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    const msg =
      typeof body === "string"
        ? body.slice(0, 180)
        : body?.error || res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  if (typeof body === "string") {
    throw new Error(`Non-JSON response: ${body.slice(0, 120)}`);
  }
  return body;
}

const pad = (n) => String(n).padStart(2, "0");
const fmtLocalInput = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;

const DICTS = {
  fr: {
    hello: (name) => `Bonjour ${name}, ravi de vous revoir sur la route !`,
    title: "Où allez-vous ?",
    subtitle:
      "On vous indique où et quand recharger en France pour payer moins cher.",
    autonomy: "Autonomie restante (Km)",
    depart: "Départ",
    arrivee: "Arrivée",
    departPh: "ex: Nantes",
    arriveePh: "ex: Paris",
    departTime: "Heure de départ",
    force: "Je veux recharger en route même si j’ai assez d’autonomie",
    plan: "Planifier",
    reco: "Recommandation",
    stationReco: "Station recommandée",
    chargeTime: "Heure de recharge",
    duration: "Durée",
    cost: "Coût estimé",
    noteOK: "Trajet faisable sans arrêt",
    seeMap: "Voir la map",
    offpeakTag: " (heures creuses)",
    noStop: "Pas d'arrêt nécessaire",
    topupNote: "Recharge optionnelle (top-up économique)",
    errEmpty: "Saisis une adresse de départ et d’arrivée.",
    errGeo: "Adresses introuvables (France).",
    calculating: "Calcul...",
  },
  en: {
    hello: (name) => `Hello ${name}, welcome back on the road!`,
    title: "Where are you going?",
    subtitle: "We tell you where and when to charge in France for less.",
    autonomy: "Remaining range (Km)",
    depart: "Departure",
    arrivee: "Arrival",
    departPh: "e.g., Nantes",
    arriveePh: "e.g., Paris",
    departTime: "Departure time",
    force: "I want to charge on the way even if I have enough range",
    plan: "Plan",
    reco: "Recommendation",
    stationReco: "Recommended station",
    chargeTime: "Charge time",
    duration: "Duration",
    cost: "Estimated cost",
    noteOK: "Trip feasible without a stop",
    seeMap: "Open map",
    offpeakTag: " (off-peak)",
    noStop: "No stop needed",
    topupNote: "Optional top-up (cheaper)",
    errEmpty: "Enter both departure and arrival.",
    errGeo: "Addresses not found (France).",
    calculating: "Calculating...",
  },
  vi: {
    hello: (name) => `Xin chào ${name}, chúc bạn lái xe an toàn!`,
    title: "Bạn đi đâu?",
    subtitle: "Chúng tôi gợi ý nơi và thời điểm sạc rẻ hơn tại Pháp.",
    autonomy: "Quãng đường còn lại (Km)",
    depart: "Điểm đi",
    arrivee: "Điểm đến",
    departPh: "ví dụ: Nantes",
    arriveePh: "ví dụ: Paris",
    departTime: "Giờ khởi hành",
    force: "Tôi muốn sạc dọc đường dù đủ pin",
    plan: "Lập kế hoạch",
    reco: "Gợi ý",
    stationReco: "Trạm sạc được đề xuất",
    chargeTime: "Thời gian sạc",
    duration: "Thời lượng",
    cost: "Chi phí ước tính",
    noteOK: "Có thể đi hết hành trình không cần dừng",
    seeMap: "Xem bản đồ",
    offpeakTag: " (giờ thấp điểm)",
    noStop: "Không cần dừng",
    topupNote: "Sạc bổ sung (tiết kiệm)",
    errEmpty: "Nhập điểm đi và điểm đến.",
    errGeo: "Không tìm thấy địa chỉ (Pháp).",
    calculating: "Đang tính...",
  },
};

export default function Planification() {
  const navigate = useNavigate();

  const [userName, setUserName] = useState("X");
  const [autonomyKm, setAutonomyKm] = useState(120);
  const [departAddr, setDepartAddr] = useState("");
  const [arriveeAddr, setArriveeAddr] = useState("");
  const [departTime, setDepartTime] = useState(fmtLocalInput());
  const [forceCharge, setForceCharge] = useState(false);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const lang = useMemo(() => localStorage.getItem("gc_lang") || "fr", []);
  const t = DICTS[lang] || DICTS.fr;
  const locale = lang === "fr" ? "fr-FR" : lang === "vi" ? "vi-VN" : "en-GB";

  useEffect(() => {
    const n = localStorage.getItem("gc_name");
    if (!n) navigate("/", { replace: true });
    else setUserName(n);
  }, [navigate]);

  const decodePolyline = (geom) =>
    polyline.decode(geom).map(([lat, lng]) => [lng, lat]);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setResult(null);
    setLoading(true);

    try {
      if (!departAddr.trim() || !arriveeAddr.trim()) {
        throw new Error(t.errEmpty);
      }

      const g1 = await getJSON(
        api(`/api/geocode?q=${encodeURIComponent(departAddr)}`)
      );

      const g2 = await getJSON(
        api(`/api/geocode?q=${encodeURIComponent(arriveeAddr)}`)
      );
      if (g1.error || g2.error) throw new Error(t.errGeo);

      const payload = {
        origin: g1,
        destination: g2,
        departAtISO: new Date(departTime).toISOString(),
        autonomyKm,
        forceCharge,
        topupKWh: 10,
      };

      const res = await fetch(`${API_BASE}/api/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.error) throw new Error(res.error);

      if (!res.recommendation) {
        setResult({
          station: t.noStop,
          heure: "-",
          duree: "-",
          cout: "-",
          note: res.note || t.noteOK,
        });
        localStorage.removeItem("gc_map");
        setLoading(false);
        return;
      }

      const start = new Date(res.recommendation.startISO);
      const end = new Date(res.recommendation.endISO);
      const minutes = Math.round((end - start) / 60000);

      setResult({
        station: res.recommendation.station.name,
        heure:
          start.toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
          }) + (res.recommendation.reason === "offpeak" ? t.offpeakTag : ""),
        duree: `${minutes} min`,
        cout: `${res.recommendation.estimatedCostEUR.toFixed(2)} €`,
        mode: res.recommendation.mode,
      });

      localStorage.setItem(
        "gc_map",
        JSON.stringify({
          station: res.recommendation.station,
          route: { polyline: decodePolyline(res.route.polyline) },
        })
      );
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  function openMap() {
    if (!localStorage.getItem("gc_map")) return;
    navigate("/carte");
  }

  return (
    <main className="min-h-screen w-full bg-white text-[#18324B] flex flex-col">
      <div className="flex-1 w-full px-4 py-6 max-w-7xl mx-auto">
        <header className="flex items-center justify-between">
          <GreenChargeLogo />
        </header>

        <section className="mt-6 space-y-2">
          <p className="text-base">{t.hello(userName)}</p>
          <h1 className="text-xl font-semibold text-[#153761]">{t.title}</h1>
          <p className="text-sm text-slate-600">{t.subtitle}</p>
        </section>

        <section className="mt-5 rounded-md bg-slate-100 p-4">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                {t.autonomy}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="20"
                  max="500"
                  value={autonomyKm}
                  onChange={(e) => setAutonomyKm(+e.target.value)}
                  className="w-full accent-green-600"
                />
                <span className="w-14 text-right text-sm tabular-nums">
                  {autonomyKm}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  {t.depart}
                </label>
                <input
                  type="text"
                  placeholder={t.departPh}
                  value={departAddr}
                  onChange={(e) => setDepartAddr(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  {t.arrivee}
                </label>
                <input
                  type="text"
                  placeholder={t.arriveePh}
                  value={arriveeAddr}
                  onChange={(e) => setArriveeAddr(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  {t.departTime}
                </label>
                <input
                  type="datetime-local"
                  value={departTime}
                  onChange={(e) => setDepartTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                  required
                />
              </div>

              <label className="flex select-none items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={forceCharge}
                  onChange={(e) => setForceCharge(e.target.checked)}
                  className="h-4 w-4 accent-green-600"
                />
                {t.force}
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#18324B] py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? t.calculating : t.plan}
            </button>
          </form>
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold text-[#153761]">{t.reco}</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="col-span-2 rounded-md border border-slate-200 p-4">
              <p className="font-semibold">
                {result?.station || t.stationReco}
              </p>
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <p>
                  <span className="font-medium">{t.chargeTime} :</span>{" "}
                  {result?.heure || "-"}
                </p>
                <p>
                  <span className="font-medium">{t.duration} :</span>{" "}
                  {result?.duree || "-"}
                </p>
                <p>
                  <span className="font-medium">{t.cost} :</span>{" "}
                  {result?.cout || "-"}
                </p>
                {result?.note && (
                  <p className="text-slate-500">{result.note}</p>
                )}
                {result?.mode === "topup" && (
                  <p className="text-xs text-slate-500">{t.topupNote}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              className="group flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md bg-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-200"
              onClick={openMap}
            >
              {t.seeMap}
              <svg
                aria-hidden
                className="h-8 w-8 text-red-500"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7Zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5Z" />
              </svg>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
