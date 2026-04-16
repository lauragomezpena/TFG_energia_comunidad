"use client";

import { Calendar } from "lucide-react";
import "./DateFilter.css";

export default function DateFilter({ startDate, endDate, setStartDate, setEndDate, onQuickFilter }) {
  
  return (
    <div className="date-filter-container">
      <div className="date-filter-header">
        <Calendar size={18} className="filter-icon" />
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Filtro de Fechas</h3>
      </div>
      
      <div className="date-filter-body">
        <div className="date-inputs">
          <div className="input-group">
            <label>Desde</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
            />
          </div>
          <div className="input-group">
            <label>Hasta</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
            />
          </div>
        </div>

        <div className="quick-filters">
          <button type="button" onClick={() => onQuickFilter('7d')}>Últimos 7 días</button>
          <button type="button" onClick={() => onQuickFilter('30d')}>Últimos 30 días</button>
          <button type="button" onClick={() => onQuickFilter('thisMonth')}>Este mes</button>
          <button type="button" onClick={() => onQuickFilter('lastMonth')}>Mes pasado</button>
          <button type="button" onClick={() => onQuickFilter('all')}>Todo el historial</button>
        </div>
      </div>
    </div>
  );
}
