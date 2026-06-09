import os
import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import Optional

class InvoiceData(BaseModel):
    tariff_type: str = Field(
        description="Tipo de tarifa contratada. Debe ser exactamente: 'PVPC' (Mercado Regulado), 'FIXED' (Mercado Libre con Precio Fijo Único) o 'TOU' (Mercado Libre con 3 Periodos - Discriminación Horaria)"
    )
    power_p1: float = Field(
        description="Potencia contratada periodo punta P1 en kW (ej: 3.45, 4.6). Si solo hay una potencia contratada única para todo el día, usa ese valor para este campo."
    )
    power_p2: float = Field(
        description="Potencia contratada periodo valle P2 en kW (ej: 3.45, 4.6). Si solo hay una potencia contratada única para todo el día, usa ese valor para este campo."
    )
    fixed_price: Optional[float] = Field(
        description="Precio fijo por kWh en euros (€/kWh) si el tipo de tarifa es FIXED (ej: 0.1325). Debe ser None si el tipo es PVPC o TOU."
    )
    p1_price: Optional[float] = Field(
        description="Precio del kWh en periodo punta P1 en euros (€/kWh) si el tipo de tarifa es TOU (ej: 0.1824). Debe ser None si el tipo es PVPC o FIXED."
    )
    p2_price: Optional[float] = Field(
        description="Precio del kWh en periodo llano P2 en euros (€/kWh) si el tipo de tarifa es TOU (ej: 0.1345). Debe ser None si el tipo es PVPC o FIXED."
    )
    p3_price: Optional[float] = Field(
        description="Precio del kWh en periodo valle P3 en euros (€/kWh) si el tipo de tarifa es TOU (ej: 0.0956). Debe ser None si el tipo es PVPC o FIXED."
    )

def extract_invoice_info(file_bytes: bytes, mime_type: str) -> dict:
    """
    Envía los bytes de la factura eléctrica a la API de Gemini
    y extrae estructuradamente los datos del contrato según el esquema InvoiceData.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("La variable de entorno GEMINI_API_KEY no está configurada.")

    client = genai.Client(api_key=api_key)

    file_part = types.Part.from_bytes(
        data=file_bytes,
        mime_type=mime_type,
    )

    prompt = (
        "Analiza detalladamente esta factura eléctrica de España. Identifica el tipo de tarifa contratada "
        "(si es regulada PVPC, si es de precio fijo único FIXED, o si tiene discriminación horaria de 3 periodos TOU). "
        "Obtén la potencia contratada para P1 y P2 en kW. Si la tarifa es FIXED, obtén el precio fijo del kWh. "
        "Si la tarifa es TOU, obtén los precios del término de energía para P1, P2 y P3 en €/kWh. "
        "Si no puedes determinar con certeza algún valor de precio, usa null/None en lugar de inventarlo. "
        "Asegúrate de mapear el tipo de tarifa exactamente a 'PVPC', 'FIXED' o 'TOU' en el JSON resultante."
    )

    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[file_part, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=InvoiceData,
            temperature=0.1
        ),
    )

    # Devolvemos los datos estructurados como un diccionario de Python
    return json.loads(response.text)
