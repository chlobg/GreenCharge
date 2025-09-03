import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

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

const messages = {
  fr: {
    tagline: "Prêt à réaliser des économies d’argent et d’énergie ?",
    welcome: "Bienvenue sur GREENCHARGE, comment dois-je vous appeler ? :)",
    placeholder: "Entrez votre nom ici",
    continue: "Continuer",
  },
  en: {
    tagline: "Ready to save money and energy?",
    welcome: "Welcome to GREENCHARGE, how should I call you? :)",
    placeholder: "Enter your name here",
    continue: "Continue",
  },
  vi: {
    tagline: "Sẵn sàng tiết kiệm tiền và năng lượng?",
    welcome: "Chào mừng đến GREENCHARGE, bạn muốn chúng tôi gọi bạn là gì? :)",
    placeholder: "Nhập tên của bạn",
    continue: "Tiếp tục",
  },
};

export default function Authentification() {
  const navigate = useNavigate();
  const [lang, setLang] = useState(localStorage.getItem("gc_lang") || "fr");
  const [name, setName] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("gc_name");
    if (saved) navigate("/planification", { replace: true });
  }, [navigate]);

  const t = messages[lang];

  const onSubmit = (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    localStorage.setItem("gc_name", clean);
    localStorage.setItem("gc_lang", lang);
    navigate("/planification");
  };

  return (
    <main className="min-h-screen w-full bg-white text-[#18324B] flex flex-col">
      <div className="flex-1 w-full px-4 py-6 max-w-7xl mx-auto">
        <header className="flex justify-start">
          <GreenChargeLogo />
        </header>

        <div className="mt-8 flex items-center justify-center gap-6 text-3xl">
          <button
            aria-label="Vietnamese"
            onClick={() => setLang("vi")}
            className={lang === "vi" ? "scale-110" : ""}
          >
            🇻🇳
          </button>
          <button
            aria-label="English"
            onClick={() => setLang("en")}
            className={lang === "en" ? "scale-110" : ""}
          >
            🇬🇧
          </button>
          <button
            aria-label="Français"
            onClick={() => setLang("fr")}
            className={lang === "fr" ? "scale-110" : ""}
          >
            🇫🇷
          </button>
        </div>

        <p className="mt-10 text-center text-green-600 font-medium">
          {t.tagline}
        </p>
        <p className="mt-8 text-sm text-center">{t.welcome}</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.placeholder}
            className="w-full rounded-md bg-slate-200/80 px-4 py-3 outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="mx-auto block w-40 rounded-md bg-[#18324B] py-3 text-white font-semibold disabled:opacity-50"
          >
            {t.continue}
          </button>
        </form>
      </div>
    </main>
  );
}
