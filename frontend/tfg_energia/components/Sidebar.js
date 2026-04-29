"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, CalendarDays, User, LogOut, Menu, X, ChevronLeft, ChevronRight, Users, Zap } from "lucide-react";
import { useState } from "react";
import "./Sidebar.css";

export default function Sidebar({ isCollapsed, setIsCollapsed }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggleMobileSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  const toggleDesktopSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const navLinks = [
    {
      name: "Dashboard",
      icon: <LayoutDashboard size={20} />,
      path: "/dashboard",
    },
    {
      name: "Mensual",
      icon: <CalendarDays size={20} />,
      path: "/mensual",
    },
    {
      name: "Comunidad",
      icon: <Users size={20} />,
      path: "/comunidad",
    },
    {
      name: "Tarifas",
      icon: <Zap size={20} />,
      path: "/tarifas",
    },
    {
      name: "Mi Perfil",
      icon: <User size={20} />,
      path: "/perfil",
    },
  ];

  const handleLogout = () => {
    localStorage.clear();
    router.push("/");
  };

  return (
    <>
      {/* Botón Hamburguesa Móvil */}
      <div className="mobile-header">
        <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", margin: 0, color: "var(--primary-dark)" }}>E-Community</h2>
        <button onClick={toggleMobileSidebar} className="hamburger-btn">
          {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Overlay Móvil */}
      {isMobileOpen && <div className="sidebar-overlay" onClick={toggleMobileSidebar}></div>}

      {/* Sidebar Principal */}
      <aside className={`sidebar ${isMobileOpen ? "sidebar-open" : ""} ${isCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className="sidebar-brand" onClick={toggleDesktopSidebar} title="Haz clic para expandir o contraer">
          <h2 className="brand-text" style={{ color: "var(--primary-blue)" }}>
            {isCollapsed ? "E-C" : "E-Community"}
          </h2>
          {!isCollapsed && <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>Agent</p>}
        </div>

        <nav className="sidebar-nav">
          <ul>
            {navLinks.map((link) => {
              const isActive = pathname === link.path;
              return (
                <li key={link.path}>
                  <Link
                    href={link.path}
                    onClick={() => setIsMobileOpen(false)}
                    className={`nav-link ${isActive ? "active" : ""} ${isCollapsed ? "nav-link-collapsed" : ""}`}
                    title={isCollapsed ? link.name : ""}
                  >
                    {link.icon}
                    {!isCollapsed && <span>{link.name}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className={`nav-link logout-link ${isCollapsed ? "nav-link-collapsed" : ""}`} title={isCollapsed ? "Cerrar Sesión" : ""}>
            <LogOut size={20} />
            {!isCollapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
