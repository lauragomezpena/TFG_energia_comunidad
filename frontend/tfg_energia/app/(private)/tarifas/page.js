"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "../../globals.css";


export default function TariffsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/");
      return;
    }

    const fetchData = async () => {
      try {
        // Obtenemos listado de viviendas
        const resHomes = await fetch("http://127.0.0.1:8000/energy/homes/", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!resHomes.ok) {
            if (resHomes.status === 401) {
              localStorage.removeItem("access_token");
              router.push("/");
              return;
            }
            throw new Error("No se pudo obtener las viviendas.");
        }
        
        let homesResult = await resHomes.json();
        // Filtramos Zonas comunes para no meterla en la recomendacion personal (a menos que quieran)
        homesResult = homesResult.filter(h => h.name !== "Zonas Comunes");
        
        if (homesResult.length === 0) {
            setLoading(false);
            setErrorMsg("No hay viviendas disponibles para el cálculo.");
            return;
        }

        const homeId = homesResult[0].id;
        const nombrePiso = homesResult[0].name;

        // Hit recommendation endpoint
        const resRec = await fetch(`http://127.0.0.1:8000/energy/recommend-tariff/?home_id=${homeId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!resRec.ok) {
            const errBody = await resRec.json();
            throw new Error(errBody.error || "Error al calcular la recomendación");
        }

        const recommendation = await resRec.json();
        
        setData({
            homeName: nombrePiso,
            ...recommendation
        });
        setLoading(false);

      } catch (err) {
        console.error(err);
        setErrorMsg(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  if (loading) {
    return (
      <div className="container" style={{ padding: "3rem", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.5rem", color: "var(--primary-blue)" }}>Calculando simulaciones...</h2>
        <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>
          Estamos cruzando tu consumo real hora a hora con los precios de mercado PVPC y las tarifas fijas libres de la API de Red Eléctrica. Esto tardará unos segundos...
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="container" style={{ padding: "3rem", textAlign: "center" }}>
        <h2 style={{ color: "#d32f2f" }}>Error</h2>
        <p>{errorMsg}</p>
      </div>
    );
  }

  if (!data || !data.rankings || data.rankings.length === 0) return null;

  const bestTariff = data.rankings[0];
  const otherTariffs = data.rankings.slice(1);

  return (
    <div className="container tarifas-page">
      <header className="tarifas-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1 className="tarifas-title" style={{ fontSize: "2rem", color: "var(--primary-blue)" }}>Asesor de Tarifas</h1>
          <p className="tarifas-subtitle" style={{ color: "var(--text-muted)" }}>
            Recomendación basada en el historial de {data.days_analyzed} días de <strong>{data.homeName}</strong>. 
            (Total cons: {data.total_kwh} kWh).
          </p>
        </div>
      </header>

      {/* Hero Card for BEST Option */}
      <div className="card best-tariff-card" style={{
          background: "linear-gradient(135deg, var(--primary-blue) 0%, rgba(30,136,229,0.8) 100%)",
          color: "white",
          padding: "2rem",
          borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(30,136,229,0.3)",
          position: "relative",
          overflow: "hidden",
          marginBottom: "2.5rem"
      }}>
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "2rem" }}>
            <div style={{ flex: "1 1 300px" }}>
                <span style={{ 
                    background: "rgba(255,255,255,0.2)", 
                    padding: "6px 12px", 
                    borderRadius: "20px", 
                    fontSize: "0.85rem", 
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    fontWeight: "bold"
                }}>🏆 Opción Más Rentable</span>
                <h2 style={{ fontSize: "2.5rem", marginTop: "1rem", marginBottom: "0.5rem" }}>{bestTariff.tarifa}</h2>
                <p style={{ fontSize: "1.1rem", opacity: 0.9 }}>
                    Según tu patrón de consumo hora a hora, esta es matemáticamente la tarifa más económica del mercado que hemos analizado simulando cruces de Maxímetro y alquiler de contador.
                </p>
            </div>
            
            <div style={{ 
                background: "white", 
                color: "var(--primary-blue)", 
                padding: "2rem", 
                borderRadius: "16px", 
                textAlign: "center",
                flex: "0 1 250px",
                boxShadow: "0 5px 15px rgba(0,0,0,0.1)"
            }}>
                <div style={{ fontSize: "1rem", color: "var(--text-muted)", fontWeight: "bold" }}>COSTE ANUAL ESTIMADO</div>
                <div style={{ fontSize: "3rem", fontWeight: "900", margin: "10px 0", color: "#1e88e5" }}>
                    {bestTariff.coste_anual_estimado_eur} <span style={{ fontSize: "1.5rem" }}>€/año</span>
                </div>
            </div>
        </div>
      </div>

      {/* Desglose de Costes */}
      <h3 style={{ marginBottom: "1rem", color: "var(--text-color)" }}>Desglose de Facturación (Anualizado) de la Ganadora</h3>
      <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1.5rem",
          marginBottom: "3rem"
      }}>
          <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem" }}>🔋</div>
              <h4 style={{ margin: "10px 0" }}>Término de Potencia</h4>
              <p style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--primary-blue)" }}>{bestTariff.detalle_anual_potencia_eur} €</p>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem" }}>⚡</div>
              <h4 style={{ margin: "10px 0" }}>Peajes Energía</h4>
              <p style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--primary-blue)" }}>{bestTariff.detalle_anual_regulados_energia_eur} €</p>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem" }}>💶</div>
              <h4 style={{ margin: "10px 0" }}>Mercado Suministro</h4>
              <p style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--primary-blue)" }}>{bestTariff.detalle_anual_energia_suministro_eur} €</p>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem" }}>⚠️</div>
              <h4 style={{ margin: "10px 0" }}>Excesos Maxímetro</h4>
              <p style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#e53935" }}>{bestTariff.detalle_anual_penalizaciones_eur} €</p>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem" }}>⏱️</div>
              <h4 style={{ margin: "10px 0" }}>Alquiler Contador</h4>
              <p style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--text-color)" }}>{bestTariff.detalle_anual_alquiler_contador_eur} €</p>
          </div>
      </div>

      <h3 style={{ marginBottom: "1rem", color: "var(--text-color)" }}>Otras Opciones Analizadas</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {otherTariffs.map((t, idx) => {
           const sobrecoste = t.coste_anual_estimado_eur - bestTariff.coste_anual_estimado_eur;

           return (
            <div key={idx} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem" }}>
                <div>
                    <h4 style={{ margin: 0, fontSize: "1.2rem" }}>{idx+2}. {t.tarifa}</h4>
                    <p style={{ margin: "5px 0 0 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>Tipo comercializadora: {t.tipo}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "var(--text-color)" }}>{t.coste_anual_estimado_eur} €/año</div>
                    <div style={{ color: "#d32f2f", fontSize: "0.9rem", fontWeight: "bold" }}>+{sobrecoste.toFixed(2)} € más cara</div>
                </div>
            </div>
           )
        })}
      </div>
    </div>
  );
}
