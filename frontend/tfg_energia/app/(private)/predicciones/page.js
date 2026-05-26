"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "../../globals.css";

function formatDateLong(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: '2-digit', minute:'2-digit' });
}

export default function PrediccionesPage() {
  const [home, setHome] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  // 1. Cargar la vivienda principal
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/"); return; }

    fetch("http://127.0.0.1:8000/energy/homes/", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => {
        if (r.status === 401) { localStorage.removeItem("access_token"); router.push("/"); }
        return r.json();
      })
      .then(data => {
        const myHomes = data.filter(h => h.name !== "Zonas Comunes");
        if (myHomes.length > 0) {
          setHome(myHomes[0]);
        }
        setInitLoading(false);
      })
      .catch(() => { setInitLoading(false); setErrorMsg("No se pudo conectar con el servidor."); });
  }, [router]);

  // 2. Lanzar predicción automáticamente cuando se cargue la vivienda
  useEffect(() => {
    if (!home) return;
    
    let isMounted = true;
    setLoading(true);
    setErrorMsg("");

    const token = localStorage.getItem("access_token");
    
    fetch(`http://127.0.0.1:8000/energy/predict/?home_id=${home.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async res => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error("Error del servidor al calcular predicciones.");
        }
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        if (data.error) throw new Error(data.error);
        setForecast(data);
        setLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        setErrorMsg(err.message);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [home]);

  // Mostrar todos los puntos horarios generados (720 horas)
  const chartData = forecast
    ? forecast.hourly.map(h => ({
        fecha_corta: new Date(h.timestamp).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        electricity_kwh: h.electricity_kwh,
      }))
    : [];

  if (initLoading) {
    return (
      <div className="container" style={{ padding: "3rem", textAlign: "center" }}>
        <div className="loading-message">Cargando datos de tu vivienda...</div>
      </div>
    );
  }

  return (
    <div className="container perfil-page">
      {/* ── Header ── */}
      <header className="perfil-header" style={{ marginBottom: "1rem" }}>
        <div>
          <h1 className="perfil-title">Predicción de Consumo</h1>
          <p className="perfil-subtitle">
            Proyección IA de los próximos <strong>30 días (hora a hora)</strong> generada con el modelo XGBoost entrenado con tu historial
          </p>
        </div>
      </header>

      {/* ── Controles / Info Vivienda ── */}
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div>
          <h3 className="metric-label" style={{ marginBottom: "4px" }}>Vivienda analizada:</h3>
          <p className="metric-value" style={{ fontSize: "1.2rem", margin: 0 }}>
            {home ? home.name : "Sin vivienda registrada"}
          </p>
        </div>
        {forecast?.from_cache && (
          <div style={{ background: "rgba(30,136,229,0.1)", color: "var(--primary-blue)", padding: "6px 12px", borderRadius: "20px", fontSize: "0.85rem", fontWeight: "bold" }}>
            ⚡ Cargado al instante (Caché BD)
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {errorMsg && (
        <div className="card" style={{ background: "rgba(229,57,53,0.1)", border: "1px solid #e53935", color: "#e53935", marginBottom: "1.5rem" }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* ── Loader ── */}
      {loading && (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🧠</div>
          <h3 style={{ color: "var(--primary-blue)" }}>La IA está generando predicciones...</h3>
          <p className="perfil-subtitle">
            El modelo XGBoost está ejecutando <strong>720 iteraciones recursivas</strong> para proyectar
            el consumo hora a hora del próximo mes. Esto puede tardar unos segundos.
          </p>
        </div>
      )}

      {/* ── Resultados ── */}
      {forecast && !loading && (
        <>
          {/* KPI Cards - Forzadas a 2x2 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem", marginBottom: "2rem" }}>
            <div className="card">
              <h3 className="metric-label">Total Predicho (30 días)</h3>
              <p className="metric-value electricity-value">
                {forecast.total_predicted_kwh} <span className="metric-unit">kWh</span>
              </p>
            </div>
            <div className="card">
              <h3 className="metric-label">Media Diaria Estimada</h3>
              <p className="metric-value electricity-value">
                {(forecast.total_predicted_kwh / (forecast.hourly.length / 24)).toFixed(2)}{" "}
                <span className="metric-unit">kWh/día</span>
              </p>
            </div>
            <div className="card" style={{ background: "linear-gradient(135deg, rgba(30,136,229,0.05), rgba(30,136,229,0.15))", border: "1px solid var(--primary-blue)" }}>
              <h3 className="metric-label">Tarifa Recomendada</h3>
              <p className="metric-value" style={{ fontSize: "1.1rem", color: "var(--text-color)" }}>
                {forecast.recommended_tariff || "No calculable"}
              </p>
            </div>
            <div className="card" style={{ background: "linear-gradient(135deg, rgba(30,136,229,0.05), rgba(30,136,229,0.15))", border: "1px solid var(--primary-blue)" }}>
              <h3 className="metric-label">Factura Estimada</h3>
              <p className="metric-value" style={{ color: "var(--primary-blue)", fontSize: "1.8rem" }}>
                {forecast.estimated_cost_eur ? `${forecast.estimated_cost_eur} €` : "—"}
              </p>
            </div>
          </div>

          {/* Gráfica Horaria Completa */}
          <div className="card" style={{ width: "100%", minHeight: "450px" }}>
            <h2 className="section-title">
              Consumo horario predicho — {formatDateLong(forecast.forecast_start)} → {formatDateLong(forecast.forecast_end)}
            </h2>
            <div style={{ width: "100%", height: "450px" }}>
              <ResponsiveContainer width="99%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="fecha_corta" minTickGap={50} />
                  <YAxis label={{ value: "kWh", angle: -90, position: "insideLeft", offset: -5 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="electricity_kwh"
                    name="Electricidad (predicción horaria)"
                    stroke="#FF9800"
                    dot={false}
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
