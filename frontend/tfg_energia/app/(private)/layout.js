"use client";

import { useState } from "react";
import Sidebar from "../../components/Sidebar";

export default function PrivateLayout({ children }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <main 
        style={{ 
           flex: 1, 
           padding: '1rem', 
           width: '100%', 
           marginLeft: '0',
           transition: 'margin-left 0.3s ease'
        }} 
        className={`main-content-wrapper ${isCollapsed ? 'main-collapsed' : ''}`}
      >
        <style>{`
          @media (min-width: 769px) {
            .main-content-wrapper {
              margin-left: 260px !important;
            }
            .main-content-wrapper.main-collapsed {
              margin-left: 80px !important;
            }
          }
        `}</style>
        {children}
      </main>
    </div>
  );
}
