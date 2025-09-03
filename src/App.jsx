// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Authentification from "./Component/Authentification.jsx";
import Planification from "./Component/Planification.jsx";
import MapPage from "./Component/MapPage.jsx";

function RequireName({ children }) {
  const name = localStorage.getItem("gc_name");
  return name ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Authentification />} />
        <Route
          path="/planification"
          element={
            <RequireName>
              <Planification />
            </RequireName>
          }
        />
        <Route
          path="/carte"
          element={
            <RequireName>
              <MapPage />
            </RequireName>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
