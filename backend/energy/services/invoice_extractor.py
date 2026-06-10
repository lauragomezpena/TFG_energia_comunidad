import os
import io
import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import Optional
from pypdf import PdfReader

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
    Extrae el texto de un PDF digital de forma local usando pypdf,
    y luego envía ese texto a Gemini para estructurar la información.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("La variable de entorno GEMINI_API_KEY no está configurada.")

    if mime_type != 'application/pdf':
        raise ValueError("Solo se admiten archivos en formato PDF para la extracción de texto local.")

    # 1. Extracción local del texto del PDF
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        extracted_text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                extracted_text += page_text + "\n"
    except Exception as e:
        raise RuntimeError(f"Error al extraer texto del PDF: {str(e)}")

    if not extracted_text.strip():
        raise ValueError(
            "La factura no tiene texto digital legible. Por favor, asegúrate de subir una factura PDF digital "
            "(no escaneada o fotografiada como imagen)."
        )

    # 2. Llamada a Gemini pasando únicamente el texto extraído
    client = genai.Client(api_key=api_key)

    prompt = (
        "Analiza el siguiente texto plano extraído localmente de una factura de electricidad en España. "
        "Identifica los siguientes parámetros y devuélvelos estructurados:\n"
        "- El tipo de tarifa contratada: 'PVPC' (si es regulado), 'FIXED' (si es precio fijo 24h), o 'TOU' (si tiene 3 periodos).\n"
        "- La potencia contratada para P1 y P2 en kW. Si solo hay una potencia contratada única para todo el día, usa ese valor para ambas.\n"
        "- Si la tarifa es FIXED, obtén el precio fijo del kWh.\n"
        "- Si la tarifa es TOU, obtén los precios del término de energía para P1, P2 y P3 en €/kWh.\n"
        "- Si no puedes determinar con certeza algún valor, usa null/None en su lugar.\n\n"
        "Texto extraído de la factura:\n"
        "--------------------------------------\n"
        f"{extracted_text}\n"
        "--------------------------------------\n"
    )

    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=InvoiceData,
            temperature=0.1
        ),
    )

    # Devolvemos los datos estructurados como un diccionario de Python
    return json.loads(response.text)
