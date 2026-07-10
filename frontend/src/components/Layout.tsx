import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/bank", label: "题库", icon: "📚" },
  { to: "/practice", label: "刷题", icon: "✍️" },
  { to: "/simulation", label: "仿真面试", icon: "🎯" },
  { to: "/history", label: "历史", icon: "📋" },
  { to: "/settings", label: "设置", icon: "⚙️" },
];

export default function Layout() {
  return (
    <div className="h-full flex flex-col bg-surface">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm px-6 py-3 flex items-center gap-8 sticky top-0 z-40">
        <div className="font-bold text-lg text-ink flex items-center gap-2">
          <span className="w-8 h-8 bg-brand-400 rounded-lg flex items-center justify-center text-white text-sm">F</span>
          <span>FaceAce <span className="text-brand-600 font-semibold">面试助手</span></span>
        </div>
        <nav className="flex gap-0.5">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-stone-100 text-ink"
                    : "text-ink-muted hover:text-ink hover:bg-stone-50"
                }`
              }
            >
              <span className="mr-1.5">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
