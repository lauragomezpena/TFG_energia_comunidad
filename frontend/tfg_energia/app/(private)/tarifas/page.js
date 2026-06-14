"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../../api";
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
        const resHomes = await fetch(`${API_BASE_URL}/energy/homes/`, {
          headers: { Authorization: `Bearer ${token}` },
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
        homesResult = homesResult.filter((h) => h.name !== "Zonas Comunes");

        if (homesResult.length === 0) {
          setLoading(false);
          setErrorMsg("No hay viviendas disponibles para el cálculo.");
          return;
        }

        const homeId = homesResult[0].id;
        const nombrePiso = homesResult[0].name;

        const resRec = await fetch(
          `${API_BASE_URL}/energy/recommend-tariff/?home_id=${homeId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!resRec.ok) {
          const errBody = await resRec.json();
          throw new Error(errBody.error || "Error al calcular la recomendación");
        }

        const recommendation = await resRec.json();

        setData({
          homeName: nombrePiso,
          ...recommendation,
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

  const bestTariff = useMemo(() => {
    if (!data?.rankings?.length) return null;
    return data.rankings[0];
  }, [data]);

  const secondBestTariff = useMemo(() => {
    if (!data?.rankings || data.rankings.length < 2) return null;
    return data.rankings[1];
  }, [data]);

  const otherTariffs = useMemo(() => {
    if (!data?.rankings?.length) return [];
    return data.rankings.slice(1);
  }, [data]);

  const savingsVsSecond = useMemo(() => {
    if (!bestTariff || !secondBestTariff) return 0;
    return (
      secondBestTariff.coste_anual_estimado_eur -
      bestTariff.coste_anual_estimado_eur
    );
  }, [bestTariff, secondBestTariff]);

  const savingsVsCurrent = useMemo(() => {
    if (!data?.current_tariff || !bestTariff) return 0;
    return (
      data.current_tariff.coste_anual_estimado_eur -
      bestTariff.coste_anual_estimado_eur
    );
  }, [data, bestTariff]);

  if (loading) {
    return (
      <div
        className="container"
        style={{ padding: "3rem", textAlign: "center" }}
      >
        <h2 style={{ fontSize: "1.5rem", color: "var(--primary-blue)" }}>
          Calculando simulaciones...
        </h2>
        <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>
          Estamos comparando distintas combinaciones de tarifa y potencia
          contratada con tu consumo real horario. Esto tardará unos segundos...
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div
        className="container"
        style={{ padding: "3rem", textAlign: "center" }}
      >
        <h2 style={{ color: "#d32f2f" }}>Error</h2>
        <p>{errorMsg}</p>
      </div>
    );
  }

  if (!data || !data.rankings || data.rankings.length === 0 || !bestTariff) {
    return null;
  }

  return (
    <div className="container tarifas-page">
      <header className="tarifas-header" style={{ marginBottom: "1rem" }}>
        <div>
          <h1
            className="tarifas-title"
            style={{ fontSize: "1.65rem", color: "var(--primary-blue)" }}
          >
            Asesor de Tarifas
          </h1>
          <p
            className="tarifas-subtitle"
            style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}
          >
            Recomendación basada en el historial de {data.days_analyzed} días de{" "}
            <strong>{data.homeName}</strong>. (Total cons: {data.total_kwh} kWh).
          </p>
          {data.n_combinations ? (
            <p style={{ color: "var(--text-muted)", marginTop: "0.4rem", fontSize: "0.85rem" }}>
              Se han analizado <strong>{data.n_combinations}</strong>{" "}
              combinaciones de tarifa y potencia contratada.
            </p>
          ) : null}
        </div>
      </header>

      <div
        className="card best-tariff-card"
        style={{
          background:
            "linear-gradient(135deg, var(--primary-blue) 0%, rgba(30,136,229,0.8) 100%)",
          color: "white",
          padding: "1.25rem",
          borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(30,136,229,0.3)",
          position: "relative",
          overflow: "hidden",
          marginBottom: "1.25rem",
        }}
      >
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "2rem",
          }}
        >
          <div style={{ flex: "1 1 340px" }}>
            {data.is_already_optimal ? (
              <span
                style={{
                  background: "#2e7d32",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "0.85rem",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  fontWeight: "bold",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
                }}
              >
                ✅ Ya tienes la tarifa óptima
              </span>
            ) : (
              <span
                style={{
                  background: "rgba(255,255,255,0.2)",
                  padding: "6px 12px",
                  borderRadius: "20px",
                  fontSize: "0.85rem",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  fontWeight: "bold",
                }}
              >
                🏆 Opción Más Rentable
              </span>
            )}

            <h2
              style={{
                fontSize: "2.2rem",
                marginTop: "1rem",
                marginBottom: "0.5rem",
              }}
            >
              {bestTariff.tarifa}
            </h2>

            <p style={{ fontSize: "1.05rem", opacity: 0.92, marginBottom: "1rem" }}>
              {data.is_already_optimal ? (
                <>
                  ¡Excelente! Tu tarifa actual y potencias contratadas coinciden con la opción más eficiente según tu patrón de consumo real. <strong>No necesitas realizar ningún cambio.</strong>
                </>
              ) : (
                <>
                  Según tu patrón de consumo real, esta combinación de{" "}
                  <strong>tarifa + potencia contratada</strong> es la que minimiza
                  el coste anual estimado entre todas las opciones analizadas.
                </>
              )}
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginTop: "0.75rem",
              }}
            >
              <span
                style={{
                  background: "rgba(255,255,255,0.16)",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  fontWeight: "600",
                }}
              >
                Tipo: {bestTariff.tipo}
              </span>
              <span
                style={{
                  background: "rgba(255,255,255,0.16)",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  fontWeight: "600",
                }}
              >
                Potencia P1: {bestTariff.potencia_p1_kw} kW
              </span>
              <span
                style={{
                  background: "rgba(255,255,255,0.16)",
                  padding: "8px 12px",
                  borderRadius: "12px",
                  fontWeight: "600",
                }}
              >
                Potencia P2: {bestTariff.potencia_p2_kw} kW
              </span>
            </div>
          </div>

          <div
            style={{
              background: "white",
              color: "var(--primary-blue)",
              padding: "2rem",
              borderRadius: "16px",
              textAlign: "center",
              flex: "0 1 280px",
              boxShadow: "0 5px 15px rgba(0,0,0,0.1)",
            }}
          >
            <div
              style={{
                fontSize: "1.05rem",
                color: "var(--text-muted)",
                fontWeight: "bold",
              }}
            >
              {data.is_already_optimal ? "TU COSTE ANUAL ESTIMADO" : "COSTE ANUAL RECOMENDADO"}
            </div>
            <div
              style={{
                fontSize: "3rem",
                fontWeight: "900",
                margin: "10px 0",
                color: data.is_already_optimal ? "#2e7d32" : "#1e88e5",
              }}
            >
              {bestTariff.coste_anual_estimado_eur}{" "}
              <span style={{ fontSize: "1.5rem" }}>€/año</span>
            </div>

            {data.is_already_optimal ? (
              <div
                style={{
                  marginTop: "0.5rem",
                  fontWeight: "700",
                  color: "#2e7d32",
                  fontSize: "0.95rem",
                }}
              >
                ✓ Tienes el coste optimizado
              </div>
            ) : (
              <>
                {savingsVsCurrent > 0 ? (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      fontWeight: "700",
                      color: "#2e7d32",
                      fontSize: "0.95rem",
                    }}
                  >
                    Ahorro estimado: {savingsVsCurrent.toFixed(2)} €/año
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "normal", marginTop: "4px" }}>
                      (Tarifa actual: {data.current_tariff.coste_anual_estimado_eur} €/año)
                    </div>
                  </div>
                ) : secondBestTariff ? (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      fontWeight: "700",
                      color: "#2e7d32",
                      fontSize: "0.95rem",
                    }}
                  >
                    Ahorro frente a la 2ª mejor: {savingsVsSecond.toFixed(2)} €/año
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      {data.explanations && data.explanations.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: "1.25rem",
            background: "var(--card-bg)",
            border: "1px solid var(--border-color)",
            padding: "1.25rem",
          }}
        >
          <h3
            style={{
              fontSize: "1.25rem",
              color: "var(--primary-blue)",
              marginBottom: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>💡</span> Entendiendo tu recomendación
          </h3>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
            }}
          >
            {data.explanations.map((exp, idx) => {
              let icon = "📋";
              let iconBg = "rgba(14, 165, 233, 0.1)";
              let iconColor = "var(--primary-blue)";

              if (exp.includes("valle") || exp.includes("Valle")) {
                icon = "🌙";
                iconBg = "rgba(156, 39, 176, 0.1)";
                iconColor = "#9c27b0";
              } else if (exp.includes("ahorro") || exp.includes("Ahorro")) {
                icon = "💰";
                iconBg = "rgba(46, 125, 50, 0.1)";
                iconColor = "#2e7d32";
              } else if (exp.includes("potencia") || exp.includes("Potencia")) {
                icon = "🔌";
                iconBg = "rgba(239, 108, 0, 0.1)";
                iconColor = "#ef6c00";
              } else if (exp.includes("alternativa") || exp.includes("segunda")) {
                icon = "⚖️";
                iconBg = "rgba(100, 116, 139, 0.1)";
                iconColor = "#64748b";
              }

              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    gap: "1rem",
                    alignItems: "flex-start",
                    padding: "1rem 1.25rem",
                    borderRadius: "12px",
                    background: "var(--bg-light)",
                    border: "1px solid var(--border-color)",
                    transition: "transform 0.15s ease, border-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateX(4px)";
                    e.currentTarget.style.borderColor = "var(--primary-blue)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.borderColor = "var(--border-color)";
                  }}
                >
                  <div
                    style={{
                      backgroundColor: iconBg,
                      color: iconColor,
                      fontSize: "1.3rem",
                      width: "42px",
                      height: "42px",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {icon}
                  </div>
                  <div style={{ flex: 1, paddingTop: "2px" }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.98rem",
                        lineHeight: "1.5",
                        color: "var(--text-main)",
                      }}
                    >
                      {exp}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <h3 style={{ marginBottom: "0.5rem", color: "var(--text-color)" }}>
        Configuración recomendada
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem" }}>📄</div>
          <h4 style={{ margin: "5px 0" }}>Tarifa</h4>
          <p
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              color: "var(--primary-blue)",
            }}
          >
            {bestTariff.tarifa}
          </p>
        </div>

        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem" }}>🔌</div>
          <h4 style={{ margin: "5px 0" }}>Potencia contratada P1</h4>
          <p
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: "var(--primary-blue)",
            }}
          >
            {bestTariff.potencia_p1_kw} kW
          </p>
        </div>

        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem" }}>🌙</div>
          <h4 style={{ margin: "5px 0" }}>Potencia contratada P2</h4>
          <p
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: "var(--primary-blue)",
            }}
          >
            {bestTariff.potencia_p2_kw} kW
          </p>
        </div>

        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem" }}>🏷️</div>
          <h4 style={{ margin: "5px 0" }}>Tipo</h4>
          <p
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: "var(--primary-blue)",
            }}
          >
            {bestTariff.tipo}
          </p>
        </div>
      </div>

      <h3 style={{ marginBottom: "0.5rem", color: "var(--text-color)" }}>
        Desglose de Facturación (Anualizado)
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem" }}>🔋</div>
          <h4 style={{ margin: "5px 0" }}>Término de Potencia</h4>
          <p
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: "var(--primary-blue)",
            }}
          >
            {bestTariff.detalle_anual_potencia_eur} €
          </p>
        </div>

        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem" }}>⚡</div>
          <h4 style={{ margin: "5px 0" }}>Peajes y Cargos Energía</h4>
          <p
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: "var(--primary-blue)",
            }}
          >
            {bestTariff.detalle_anual_regulados_energia_eur} €
          </p>
        </div>

        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem" }}>💶</div>
          <h4 style={{ margin: "5px 0" }}>Suministro de Energía</h4>
          <p
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: "var(--primary-blue)",
            }}
          >
            {bestTariff.detalle_anual_energia_suministro_eur} €
          </p>
        </div>

        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem" }}>⚠️</div>
          <h4 style={{ margin: "5px 0" }}>Excesos de Potencia</h4>
          <p
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color:
                bestTariff.detalle_anual_penalizaciones_eur > 0
                  ? "#e53935"
                  : "var(--text-color)",
            }}
          >
            {bestTariff.detalle_anual_penalizaciones_eur} €
          </p>
        </div>

        <div className="card" style={{ textAlign: "center", padding: "1rem" }}>
          <div style={{ fontSize: "1.5rem" }}>⏱️</div>
          <h4 style={{ margin: "5px 0" }}>Alquiler Contador</h4>
          <p
            style={{
              fontSize: "1.2rem",
              fontWeight: "bold",
              color: "var(--text-color)",
            }}
          >
            {bestTariff.detalle_anual_alquiler_contador_eur} €
          </p>
        </div>
      </div>

      <h3 style={{ marginBottom: "1rem", color: "var(--text-color)" }}>
        Otras Opciones Analizadas
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {otherTariffs.map((t, idx) => {
          const sobrecoste =
            t.coste_anual_estimado_eur - bestTariff.coste_anual_estimado_eur;

          return (
            <div
              key={idx}
              className="card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1.5rem",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: "1.2rem" }}>
                  {idx + 2}. {t.tarifa}
                </h4>
                <p
                  style={{
                    margin: "6px 0 0 0",
                    color: "var(--text-muted)",
                    fontSize: "0.95rem",
                  }}
                >
                  Tipo: {t.tipo} · Potencia P1: {t.potencia_p1_kw} kW · Potencia
                  P2: {t.potencia_p2_kw} kW
                </p>
              </div>

              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: "1.4rem",
                    fontWeight: "bold",
                    color: "var(--text-color)",
                  }}
                >
                  {t.coste_anual_estimado_eur} €/año
                </div>
                <div
                  style={{
                    color: "#d32f2f",
                    fontSize: "0.9rem",
                    fontWeight: "bold",
                  }}
                >
                  +{sobrecoste.toFixed(2)} € más cara
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}