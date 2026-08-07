import "./CursorPagination.css";

/** RF-03: paginacion por cursor -- sin numeros de pagina, solo adelante/atras. */
export function CursorPagination({ canPrev, canNext, onPrev, onNext, totalCount, shown }) {
  return (
    <div className="cursor-pagination">
      <span className="cursor-pagination-count">
        {shown} de {totalCount.toLocaleString("es")} registros
      </span>
      <div className="cursor-pagination-buttons">
        <button className="pressable" onClick={onPrev} disabled={!canPrev}>
          ← Anterior
        </button>
        <button className="pressable" onClick={onNext} disabled={!canNext}>
          Siguiente →
        </button>
      </div>
    </div>
  );
}
