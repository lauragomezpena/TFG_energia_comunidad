"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import DateFilter from "../../../components/DateFilter";
import "../../globals.css";
// Podríamos reutilizar el estilo de mensual
import "../mensual/style.css"; 

export default function ComunidadPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para el filtro de fechas
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/");
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/energy/readings/", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!res.ok) {
          if (res.status === 401) {
            localStorage.removeItem("access_token");
            router.push("/");
            return;
          }
          throw new Error("Error al obtener datos");
        }

        const result = await res.json();
        
        // Filtrar solo las lecturas de Zonas Comunes
        const comunesResult = result.filter(d => d.home && d.home.name === "Zonas Comunes");

        // Formatear fechas
        const formattedData = comunesResult.map(d => ({
          ...d,
          fecha_corta: new Date(d.timestamp).toLocaleDateString(),
          timestamp_ms: new Date(d.timestamp).getTime()
        })).sort((a, b) => a.timestamp_ms - b.timestamp_ms);

        setData(formattedData);
        
        // Configurar fechas por defecto (últimos 30 días)
        if (formattedData.length > 0) {
          const maxDate = formattedData[formattedData.length - 1].timestamp_ms;
          const minDate = maxDate - (30 * 24 * 60 * 60 * 1000); // 30 días antes
          
          setEndDate(new Date(maxDate).toISOString().split('T')[0]);
          setStartDate(new Date(minDate).toISOString().split('T')[0]);
        }

        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  // Lógica del filtro de fechas
  const handleQuickFilter = (type) => {
    if (data.length === 0) return;
    
    const latestRecordDate = new Date(data[data.length - 1].timestamp_ms);
    const latestTime = latestRecordDate.getTime();
    
    let resultStart = new Date();
    let resultEnd = latestRecordDate;

    switch (type) {
      case '7d':
        resultStart = new Date(latestTime - (7 * 24 * 60 * 60 * 1000));
        break;
      case '30d':
        resultStart = new Date(latestTime - (30 * 24 * 60 * 60 * 1000));
        break;
      case 'thisMonth':
        resultStart = new Date(latestRecordDate.getFullYear(), latestRecordDate.getMonth(), 1);
        resultEnd = new Date(latestRecordDate.getFullYear(), latestRecordDate.getMonth() + 1, 0);
        break;
      case 'lastMonth':
        resultStart = new Date(latestRecordDate.getFullYear(), latestRecordDate.getMonth() - 1, 1);
        resultEnd = new Date(latestRecordDate.getFullYear(), latestRecordDate.getMonth(), 0);
        break;
      case 'all':
        resultStart = new Date(data[0].timestamp_ms);
        resultEnd = latestRecordDate;
        break;
      default:
        break;
    }

    setStartDate(resultStart.toISOString().split('T')[0]);
    setEndDate(resultEnd.toISOString().split('T')[0]);
  };

  // Filtrar los datos
  const filteredData = useMemo(() => {
    if (!startDate || !endDate) return data;

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime() + (24 * 60 * 60 * 1000 - 1);

    return data.filter(d => d.timestamp_ms >= startMs && d.timestamp_ms <= endMs);
  }, [data, startDate, endDate]);

  const totalAgua = filteredData.reduce((acc, curr) => acc + curr.water_m3, 0).toFixed(2);
  const totalElectricidad = filteredData.reduce((acc, curr) => acc + curr.electricity_kwh, 0).toFixed(2);

  return (
    <div className="container perfil-page">
      <header className="perfil-header" style={{ marginBottom: "1rem" }}>
        <div>
          <h1 className="perfil-title">Gastos de Comunidad</h1>
          <p className="perfil-subtitle">Consumos generales: Conserje, pasillos, térmica solar...</p>
        </div>
      </header>

      <DateFilter 
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        onQuickFilter={handleQuickFilter}
      />

      {loading ? (
        <div className="loading-message">Cargando datos...</div>
      ) : filteredData.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          <h3>No hay datos para el rango seleccionado.</h3>
          <p>Prueba a seleccionar otro periodo de fechas o asegúrate de que el backend tiene la Zonas Comunes generada.</p>
        </div>
      ) : (
        <>
          <div className="perfil-grid" style={{ marginBottom: "2rem" }}>
            <div className="card">
              <h3 className="metric-label">Electricidad Común (Periodo Selec.)</h3>
              <p className="metric-value electricity-value">
                {totalElectricidad} <span className="metric-unit">kWh</span>
              </p>
            </div>

            <div className="card">
              <h3 className="metric-label">Agua Caliente (Periodo Selec.)</h3>
              <p className="metric-value water-value">
                {totalAgua} <span className="metric-unit">m³</span>
              </p>
            </div>
          </div>

          <div className="card" style={{ width: '100%', minHeight: '350px' }}>
            <h2 className="section-title">Evolución de Zonas Comunes</h2>
            <div style={{ width: '100%', height: '350px' }}>
              <ResponsiveContainer width="99%" height="100%">
                <LineChart data={filteredData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="fecha_corta" minTickGap={50} />
                  <YAxis yAxisId="left" label={{ value: 'kWh (Electr)', angle: -90, position: 'insideLeft', offset: -5 }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'm³ (Agua)', angle: 90, position: 'insideRight', offset: 5 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="electricity_kwh" name="Electricidad Comunidad" stroke="#FF9800" dot={false} strokeWidth={2} />
                  <Line yAxisId="right" type="step" dataKey="water_m3" name="Agua Caliente ACS" stroke="#00BCD4" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
