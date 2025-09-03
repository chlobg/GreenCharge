import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const centerNantes = [47.2184, -1.5536];

function FitBounds({ poly, station }) {
  const map = useMap();
  useEffect(() => {
    const pts = [];
    if (poly?.length) pts.push(...poly.map(([lng, lat]) => [lat, lng]));
    if (station) pts.push([station.lat, station.lng]);
    if (!pts.length) {
      map.setView(centerNantes, 12);
      return;
    }
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [map, poly, station]);
  return null;
}

function ZoomButtons() {
  const map = useMap();
  return (
    <div className="absolute bottom-8 left-1/2 z-[1000] flex -translate-x-1/2 overflow-hidden rounded-md bg-slate-200">
      <button
        onClick={() => map.zoomIn()}
        className="px-6 py-3 border-r border-slate-300"
      >
        Zoom In
      </button>
      <button onClick={() => map.zoomOut()} className="px-6 py-3">
        Zoom Out
      </button>
    </div>
  );
}

export default function MapPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem("gc_map");
    if (!raw) {
      navigate("/planification", { replace: true });
      return;
    }
    setData(JSON.parse(raw));
  }, [navigate]);

  const poly = useMemo(() => data?.route?.polyline || [], [data]);
  const station = data?.station;

  const polyLatLng = useMemo(
    () => poly.map(([lng, lat]) => [lat, lng]),
    [poly]
  );

  const icon = useMemo(
    () =>
      L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      }),
    []
  );

  return (
    <main className="min-h-screen w-full bg-white text-[#18324B] flex flex-col">
      <div className="flex-1 w-full px-4 py-6 max-w-7xl mx-auto">
        <header className="flex items-center gap-2 mb-4">
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
        </header>

        <div className="relative overflow-hidden rounded-md border border-slate-200">
          <MapContainer
            center={centerNantes}
            zoom={12}
            className="h-[300px] w-full"
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {polyLatLng.length > 1 && (
              <Polyline
                positions={polyLatLng}
                pathOptions={{ color: "#2563eb", weight: 4 }}
              />
            )}
            {station && (
              <Marker position={[station.lat, station.lng]} icon={icon} />
            )}
            <FitBounds poly={poly} station={station} />
            <ZoomButtons />
          </MapContainer>
        </div>
      </div>
    </main>
  );
}
