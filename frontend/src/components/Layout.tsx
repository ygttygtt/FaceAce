import { NavLink, Outlet } from "react-router-dom";
import { useUIStore } from "../store/useConfigStore";

const navItems = [
  { to: "/bank", label: "题库" },
  { to: "/practice", label: "刷题" },
  { to: "/simulation", label: "仿真面试" },
  { to: "/history", label: "历史" },
  { to: "/settings", label: "设置" },
];

export default function Layout() {
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);

  return (
    <div className="h-full flex flex-col">
      <header className="border-b bg-white px-3 sm:px-6 py-3 flex flex-wrap items-center gap-2 sm:gap-8 shadow-sm dark:bg-slate-900 dark:border-slate-700">
        <div className="font-bold text-lg text-gray-800 whitespace-nowrap flex items-center gap-2 dark:text-gray-100">
          <img src="/faceace-logo.png" alt="FaceAce" className="w-8 h-8 object-contain" />
          <span>FaceAce <span className="text-blue-600 dark:text-blue-400">面试助手</span></span>
        </div>
        <nav className="order-3 sm:order-none flex flex-1 gap-1 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${
                  isActive
                    ? "bg-blue-100 text-blue-700 font-medium dark:bg-blue-900/60 dark:text-blue-200"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-slate-800"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={toggleTheme}
          className="ml-auto sm:ml-0 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-slate-700 dark:hover:text-amber-200 dark:focus:ring-offset-slate-900"
          aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-950">
        <Outlet />
      </main>
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5 8.5 8.5 0 1 0 20.5 14.4Z" />
    </svg>
  );
}
