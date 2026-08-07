import { useState } from "react";
import { StateMessage } from "../../common/StateMessage/StateMessage.jsx";
import "./JsonViewer.css";

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Highlight liviano sin dependencias externas. RNF-05 exige prevenir XSS
 * en la interface web: el body/headers capturados son texto arbitrario
 * del consumidor de la API que se esta monitoreando, asi que se escapa
 * TODO caracter HTML-significativo antes de envolverlo en los <span> de
 * color -- lo unico que se inyecta via dangerouslySetInnerHTML son esos
 * spans generados por nosotros, nunca markup del dato original.
 */
function highlightJson(value) {
  const json = escapeHtml(JSON.stringify(value, null, 2));
  return json.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "jv-number";
      if (match.startsWith('"')) {
        cls = match.endsWith(":") ? "jv-key" : "jv-string";
      } else if (match === "true" || match === "false") {
        cls = "jv-boolean";
      } else if (match === "null") {
        cls = "jv-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export function JsonViewer({ value }) {
  const [copied, setCopied] = useState(false);

  if (value === undefined || value === null) {
    return <StateMessage>Sin contenido.</StateMessage>;
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible (ej. contexto no seguro); no es critico */
    }
  }

  return (
    <div className="json-viewer">
      <button className="json-viewer-copy" onClick={handleCopy}>
        {copied ? "Copiado ✓" : "Copiar"}
      </button>
      <pre className="scrollx">
        <code dangerouslySetInnerHTML={{ __html: highlightJson(value) }} />
      </pre>
    </div>
  );
}
