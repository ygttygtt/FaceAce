import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/bank", label: "题库" },
  { to: "/practice", label: "刷题" },
  { to: "/simulation", label: "仿真面试" },
  { to: "/history", label: "历史" },
  { to: "/settings", label: "设置" },
];

export default function Layout() {
  return (
    <div className="h-full flex flex-col">
      <header className="border-b bg-white px-3 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-8 shadow-sm">
        <div className="font-bold text-lg text-gray-800 whitespace-nowrap flex items-center gap-2">
          <img src="/faceace-logo.png" alt="FaceAce" className="w-8 h-8 object-contain" />
          <span>FaceAce <span className="text-blue-600">面试助手</span></span>
        </div>
        <nav className="flex gap-1 w-full overflow-x-auto pb-1 sm:pb-0">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${
                  isActive
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
