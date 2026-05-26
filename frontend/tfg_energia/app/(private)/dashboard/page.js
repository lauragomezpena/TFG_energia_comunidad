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
  ResponsiveContainer
} from "recharts";
import "../../globals.css";
import "./style.css";

export default function DashboardPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartReady, setChartReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setChartReady(true);
  }, []);

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

        let myHomeResult = result.filter(d => d.home && d.home.name !== "Zonas Comunes");

        if (myHomeResult.length > 0) {
          const firstHomeId = myHomeResult[0].home.id;
          myHomeResult = myHomeResult.filter(d => d.home.id === firstHomeId);
        }

        const formattedData = myHomeResult.map((d) => ({
          ...d,
          fecha_corta: new Date(d.timestamp).toLocaleDateString(),
          timestamp_ms: new Date(d.timestamp).getTime()
        })).sort((a, b) => a.timestamp_ms - b.timestamp_ms);

        setData(formattedData);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const totalAgua = data.reduce((acc, curr) => acc + curr.water_m3, 0).toFixed(2);
  const totalElectricidad = data.reduce((acc, curr) => acc + curr.electricity_kwh, 0).toFixed(2);

  const nombrePiso = data.length > 0 && data[0].home ? data[0].home.name : "tu vivienda";

  return (
    <div className="container dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Panel de Control Energético</h1>
          <p className="dashboard-subtitle">
            Bienvenido a los consumos de <strong>{nombrePiso}</strong>
          </p>
        </div>

        <div className="dashboard-actions">
          {/* Los botones han sido movidos al Sidebar global */}
        </div>
      </header>

      {loading ? (
        <div className="loading-message">Cargando tus datos energéticos...</div>
      ) : data.length === 0 ? (
        <div className="card text-center">No hay datos registrados para tu vivienda.</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="card">
              <h3 className="kpi-label">Consumo Eléctrico Total</h3>
              <p className="kpi-value electricity-value">
                {totalElectricidad} <span className="kpi-unit">kWh</span>
              </p>
            </div>

            <div className="card">
              <h3 className="kpi-label">Consumo de ACS Total</h3>
              <p className="kpi-value water-value">
                {totalAgua} <span className="kpi-unit">m³</span>
              </p>
            </div>

            <div className="card">
              <h3 className="kpi-label">Est. Coste Acumulado</h3>
              <p className="kpi-value cost-value">
                0.00 <span className="kpi-unit">€</span>
              </p>
            </div>
          </div>

          <div className="card chart-card">
            <h2 className="chart-title">Evolución de Consumo Histórico</h2>

            <div className="chart-shell">
              {chartReady && (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="fecha_corta" minTickGap={50} />
                    <YAxis
                      yAxisId="left"
                      label={{
                        value: "kWh (Electr)",
                        angle: -90,
                        position: "insideLeft",
                        offset: -5
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      label={{
                        value: "m³ (Agua)",
                        angle: 90,
                        position: "insideRight",
                        offset: 5
                      }}
                    />
                    <Tooltip />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="electricity_kwh"
                      name="Electricidad"
                      stroke="#FF9800"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="step"
                      dataKey="water_m3"
                      name="Agua Caliente (ACS)"
                      stroke="#00BCD4"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}