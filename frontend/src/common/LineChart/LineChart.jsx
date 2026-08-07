import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StateMessage } from "../StateMessage/StateMessage.jsx";
import "./LineChart.css";

const VIEW_W = 600;
const VIEW_H = 200;
const PAD_LEFT = 38;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Linea temporal generica (RF-03: Timeline de Requests / Performance).
 * `points`: [{ label, value }]. Un solo hue -- una sola serie no necesita
 * leyenda (el titulo de la card ya dice que se esta graficando). Incluye
 * crosshair + tooltip por defecto (dataviz: "an HTML/SVG chart IS
 * interactive"), y una animacion de trazado al montar/actualizar datos.
 */
export function LineChart({ points, colorVar = "--series-1", valueFormatter = (v) => Math.round(v) }) {
  const pathRef = useRef(null);
  const [drawn, setDrawn] = useState(false);
  const [hoverIndex, setHoverIndex] = useState(null);

  const hasData = points && points.length > 1;
  const maxValue = hasData ? niceMax(Math.max(...points.map((p) => p.value), 1)) : 1;

  const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT;
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;

  const xAt = (i) => PAD_LEFT + (hasData ? (i / (points.length - 1)) * plotW : 0);
  const yAt = (v) => PAD_TOP + plotH - (v / maxValue) * plotH;

  const linePath = hasData
    ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p.value).toFixed(2)}`).join(" ")
    : "";
  const areaPath = hasData
    ? `${linePath} L ${xAt(points.length - 1).toFixed(2)} ${PAD_TOP + plotH} L ${xAt(0)} ${PAD_TOP + plotH} Z`
    : "";

  useLayoutEffect(() => {
    setDrawn(false);
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [linePath]);

  useEffect(() => {
    setHoverIndex(null);
  }, [points]);

  if (!hasData) return <StateMessage>No hay suficientes datos en la ventana actual.</StateMessage>;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const pathLength = pathRef.current?.getTotalLength?.() ?? 0;

  function handleMove(event) {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const ratio = Math.min(1, Math.max(0, (relX - PAD_LEFT) / plotW));
    const index = Math.round(ratio * (points.length - 1));
    setHoverIndex(index);
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const tooltipX = hovered ? Math.min(VIEW_W - PAD_RIGHT - 82, Math.max(PAD_LEFT, xAt(hoverIndex) - 40)) : 0;

  return (
    <div className="line-chart">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="line-chart-svg"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        role="img"
      >
        {gridLines.map((g) => (
          <line
            key={g}
            x1={PAD_LEFT}
            x2={VIEW_W - PAD_RIGHT}
            y1={PAD_TOP + plotH * g}
            y2={PAD_TOP + plotH * g}
            className="line-chart-grid"
          />
        ))}
        <text x={4} y={PAD_TOP + 4} className="line-chart-tick">
          {valueFormatter(maxValue)}
        </text>
        <text x={4} y={PAD_TOP + plotH + 4} className="line-chart-tick">
          0
        </text>

        <path d={areaPath} fill={`var(${colorVar})`} className="line-chart-area" />
        <path
          ref={pathRef}
          d={linePath}
          fill="none"
          stroke={`var(${colorVar})`}
          className="line-chart-line"
          style={
            pathLength
              ? {
                  strokeDasharray: pathLength,
                  strokeDashoffset: drawn ? 0 : pathLength,
                }
              : undefined
          }
        />

        {points.map((p, i) =>
          i === points.length - 1 ? (
            <circle key={i} cx={xAt(i)} cy={yAt(p.value)} r="4" className="line-chart-end-dot" fill={`var(${colorVar})`} />
          ) : null
        )}

        {hovered && (
          <g className="line-chart-hover">
            <line x1={xAt(hoverIndex)} x2={xAt(hoverIndex)} y1={PAD_TOP} y2={PAD_TOP + plotH} className="line-chart-crosshair" />
            <circle cx={xAt(hoverIndex)} cy={yAt(hovered.value)} r="4.5" fill={`var(${colorVar})`} className="line-chart-hover-dot" />
            <g transform={`translate(${tooltipX}, ${PAD_TOP + 2})`}>
              <rect width="82" height="34" rx="6" className="line-chart-tooltip-bg" />
              <text x="8" y="14" className="line-chart-tooltip-label">
                {hovered.label}
              </text>
              <text x="8" y="27" className="line-chart-tooltip-value">
                {valueFormatter(hovered.value)}
              </text>
            </g>
          </g>
        )}
      </svg>
      <div className="line-chart-xaxis">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
