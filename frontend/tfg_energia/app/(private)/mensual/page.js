"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import DateFilter from "../../../components/DateFilter";
import { API_BASE_URL } from "../../api";
import "../../globals.css";
import "./style.css"; // Usa los estilos base de perfil u otros

export default function MensualPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  
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
        const res = await fetch(`${API_BASE_URL}/energy/readings/`, {
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
        
        let myHomeResult = result.filter(d => d.home && d.home.name !== "Zonas Comunes");

        if (myHomeResult.length > 0) {
          const firstHomeId = myHomeResult[0].home.id;
          myHomeResult = myHomeResult.filter(d => d.home.id === firstHomeId);
        }

        // Formatear fechas
        const formattedData = myHomeResult.map(d => ({
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

    const fetchProfile = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/profile/`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (res.ok) {
          const result = await res.json();
          setProfile(result);
        }
      } catch (err) {
        console.error("Error al obtener el perfil:", err);
      }
    };

    fetchData();
    fetchProfile();
  }, [router]);

  // Lógica del filtro de fechas
  const handleQuickFilter = (type) => {
    if (data.length === 0) return;
    
    // Obtenemos la última fecha disponible en la BD para hacer cálculos relativos
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

  // Filtrar los datos en base al rango de fechas e ignorar el tiempo (horas)
  const filteredData = useMemo(() => {
    if (!startDate || !endDate) return data;

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime() + (24 * 60 * 60 * 1000 - 1); // Final del día

    return data.filter(d => d.timestamp_ms >= startMs && d.timestamp_ms <= endMs);
  }, [data, startDate, endDate]);

  const totalAgua = filteredData.reduce((acc, curr) => acc + curr.water_m3, 0).toFixed(2);
  const totalElectricidad = filteredData.reduce((acc, curr) => acc + curr.electricity_kwh, 0).toFixed(2);

  const totalCoste = useMemo(() => {
    if (filteredData.length === 0) return "0.00";

    const tariffType = profile?.current_tariff_type || "PVPC";
    const powerP1 = profile?.current_power_p1 !== undefined && profile?.current_power_p1 !== null ? Number(profile.current_power_p1) : 3.45;
    const powerP2 = profile?.current_power_p2 !== undefined && profile?.current_power_p2 !== null ? Number(profile.current_power_p2) : 3.45;

    const fixedPrice = profile?.current_tariff_fixed_price !== undefined && profile?.current_tariff_fixed_price !== null
      ? Number(profile.current_tariff_fixed_price)
      : 0.12;

    const p1Price = profile?.current_tariff_p1_price !== undefined && profile?.current_tariff_p1_price !== null
      ? Number(profile.current_tariff_p1_price)
      : 0.18;
    const p2Price = profile?.current_tariff_p2_price !== undefined && profile?.current_tariff_p2_price !== null
      ? Number(profile.current_tariff_p2_price)
      : 0.13;
    const p3Price = profile?.current_tariff_p3_price !== undefined && profile?.current_tariff_p3_price !== null
      ? Number(profile.current_tariff_p3_price)
      : 0.09;

    // Precios de suministro PVPC por defecto si no hay API en tiempo real
    const pvpcP1 = 0.16;
    const pvpcP2 = 0.11;
    const pvpcP3 = 0.07;

    // Término de energía regulado (peajes + cargos)
    const regP1 = 0.097553;
    const regP2 = 0.029267;
    const regP3 = 0.003292;

    let energyCost = 0;

    filteredData.forEach(reading => {
      const kwh = reading.electricity_kwh || 0;
      const date = new Date(reading.timestamp);
      
      // Clasificación de periodos 2.0TD
      let period = "P1";
      const day = date.getDay(); // 0 = Domingo, 6 = Sábado
      if (day === 0 || day === 6) {
        period = "P3";
      } else {
        const hour = date.getHours();
        if (hour >= 0 && hour < 8) {
          period = "P3";
        } else if ((hour >= 8 && hour < 10) || (hour >= 14 && hour < 18) || (hour >= 22 && hour < 24)) {
          period = "P2";
        } else {
          period = "P1";
        }
      }

      // 1) Peajes y cargos regulados
      const regCost = kwh * (period === "P1" ? regP1 : period === "P2" ? regP2 : regP3);

      // 2) Suministro libre o regulado
      let supplyCost = 0;
      if (tariffType === "FIXED") {
        supplyCost = kwh * fixedPrice;
      } else if (tariffType === "TOU") {
        supplyCost = kwh * (period === "P1" ? p1Price : period === "P2" ? p2Price : p3Price);
      } else {
        // PVPC
        supplyCost = kwh * (period === "P1" ? pvpcP1 : period === "P2" ? pvpcP2 : pvpcP3);
      }

      energyCost += regCost + supplyCost;
    });

    // Calcular días únicos representados en las lecturas
    const uniqueDays = new Set(filteredData.map(d => new Date(d.timestamp_ms).toISOString().split('T')[0]));
    const days = Math.max(uniqueDays.size, 1);

    // Término de potencia
    const p1Day = 27.704413 / 365.0;
    const p2Day = 0.725423 / 365.0;
    const powerCost = days * (powerP1 * p1Day + powerP2 * p2Day);

    // Alquiler del contador
    const meterRentalCost = days * 0.0266;

    const total = energyCost + powerCost + meterRentalCost;
    return total.toFixed(2);
  }, [filteredData, profile]);

  return (
    <div className="container perfil-page">
      <header className="perfil-header" style={{ marginBottom: "1rem" }}>
        <div>
          <h1 className="perfil-title">Análisis Mensual</h1>
          <p className="perfil-subtitle">Filtra y explora los consumos en detalle</p>
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
          <p>Prueba a seleccionar otro periodo de fechas.</p>
        </div>
      ) : (
        <>
          <div className="perfil-grid" style={{ marginBottom: "2rem" }}>
            <div className="card">
              <h3 className="metric-label">Consumo Eléctrico Seleccionado</h3>
              <p className="metric-value electricity-value">
                {totalElectricidad} <span className="metric-unit">kWh</span>
              </p>
            </div>
 
            <div className="card">
              <h3 className="metric-label">Consumo de ACS Seleccionado</h3>
              <p className="metric-value water-value">
                {totalAgua} <span className="metric-unit">m³</span>
              </p>
            </div>

            <div className="card">
              <h3 className="metric-label">Coste Estimado Seleccionado</h3>
              <p className="metric-value cost-value">
                {totalCoste} <span className="metric-unit">€</span>
              </p>
            </div>
          </div>

          <div className="card" style={{ width: '100%', minHeight: '350px' }}>
            <h2 className="section-title">Evolución en el periodo</h2>
            <div style={{ width: '100%', height: '350px' }}>
              <ResponsiveContainer width="99%" height="100%">
                <LineChart data={filteredData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="fecha_corta" minTickGap={50} />
                  <YAxis yAxisId="left" label={{ value: 'kWh (Electr)', angle: -90, position: 'insideLeft', offset: -5 }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'm³ (Agua)', angle: 90, position: 'insideRight', offset: 5 }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="electricity_kwh" name="Electricidad" stroke="#FF9800" dot={false} strokeWidth={2} />
                  <Line yAxisId="right" type="step" dataKey="water_m3" name="Agua Caliente (ACS)" stroke="#00BCD4" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}