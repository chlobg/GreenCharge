import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import polyline from "polyline";

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

const pad = (n) => String(n).padStart(2, "0");
const fmtLocalInput = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;

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
        throw new Error("Saisis une adresse de départ et d’arrivée.");
      }

      const g1 = await fetch(
        `/api/geocode?q=${encodeURIComponent(departAddr)}`
      ).then((r) => r.json());
      const g2 = await fetch(
        `/api/geocode?q=${encodeURIComponent(arriveeAddr)}`
      ).then((r) => r.json());
      if (g1.error || g2.error)
        throw new Error("Adresses introuvables (France).");

      const payload = {
        origin: g1,
        destination: g2,
        departAtISO: new Date(departTime).toISOString(),
        autonomyKm,
        forceCharge,
        topupKWh: 10,
      };
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (res.error) throw new Error(res.error);

      if (!res.recommendation) {
        setResult({
          station: "Pas d'arrêt nécessaire",
          heure: "-",
          duree: "-",
          cout: "-",
          note: res.note || "Trajet faisable sans arrêt",
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
          start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
          (res.recommendation.reason === "offpeak" ? " (heures creuses)" : ""),
        duree: `${minutes} minutes`,
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
      setErr(e?.message || "Erreur de calcul");
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
          <p className="text-base">
            Bonjour <span className="font-semibold">{userName}</span>, ravi de
            vous revoir sur la route !
          </p>
          <h1 className="text-xl font-semibold text-[#153761]">
            Où allez-vous ?
          </h1>
          <p className="text-sm text-slate-600">
            On vous indique où et quand recharger en{" "}
            <span className="text-green-600 font-medium">France</span> pour
            payer moins cher.
          </p>
        </section>

        <section className="mt-5 rounded-md bg-slate-100 p-4">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Autonomie restante (Km)
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
                  Départ
                </label>
                <input
                  type="text"
                  placeholder="ex: Nantes"
                  value={departAddr}
                  onChange={(e) => setDepartAddr(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Arrivée
                </label>
                <input
                  type="text"
                  placeholder="ex: Paris"
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
                  Heure de départ
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
                Je veux recharger en route même si j’ai assez d’autonomie
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#18324B] py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Calcul..." : "Planifier"}
            </button>
          </form>
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold text-[#153761]">
            Recommandation
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="col-span-2 rounded-md border border-slate-200 p-4">
              <p className="font-semibold">
                {result?.station || "Station recommandée"}
              </p>
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <p>
                  <span className="font-medium">Heure de recharge :</span>{" "}
                  {result?.heure || "-"}
                </p>
                <p>
                  <span className="font-medium">Durée :</span>{" "}
                  {result?.duree || "-"}
                </p>
                <p>
                  <span className="font-medium">Coût estimé :</span>{" "}
                  {result?.cout || "-"}
                </p>
                {result?.note && (
                  <p className="text-slate-500">{result.note}</p>
                )}
                {result?.mode === "topup" && (
                  <p className="text-xs text-slate-500">
                    Recharge optionnelle (top-up économique)
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              className="group flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md bg-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-200"
              onClick={openMap}
            >
              Voir la map
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
