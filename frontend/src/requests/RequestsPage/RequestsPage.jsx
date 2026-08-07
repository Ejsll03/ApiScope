import { useState } from "react";
import { Card } from "../../common/Card/Card.jsx";
import { useRequests } from "../../hooks/useRequests.js";
import { FiltersBar } from "../FiltersBar/FiltersBar.jsx";
import { RequestsTable } from "../RequestsTable/RequestsTable.jsx";
import { CursorPagination } from "../CursorPagination/CursorPagination.jsx";
import { api, ApiError } from "../../api/client.js";
import "./RequestsPage.css";

export function RequestsPage({ onSelect }) {
  const [filters, setFilters] = useState({ type: "request" });
  const [idSearch, setIdSearch] = useState("");
  const [idError, setIdError] = useState(null);
  const { data, pagination, loading, error, goNext, goPrev, canNext, canPrev } = useRequests(filters);

  async function handleIdSearch(event) {
    event.preventDefault();
    if (!idSearch.trim()) return;
    setIdError(null);
    try {
      await api.getRequestById(idSearch.trim());
      onSelect(idSearch.trim());
    } catch (err) {
      setIdError(err instanceof ApiError && err.status === 404 ? "No existe ningun registro con ese ID." : err.message);
    }
  }

  return (
    <>
      <div className="requests-toolbar">
        <h1 className="requests-title">Requests</h1>
        <form className="id-search" onSubmit={handleIdSearch}>
          <input
            type="text"
            placeholder="Ir a un ID exacto..."
            value={idSearch}
            onChange={(event) => {
              setIdSearch(event.target.value);
              setIdError(null);
            }}
          />
          <button type="submit">Ir</button>
        </form>
      </div>
      {idError && <div className="id-search-error fade-in">{idError}</div>}

      <FiltersBar onChange={setFilters} />

      <Card>
        <RequestsTable data={data} loading={loading} error={error} onSelect={onSelect} />
      </Card>

      {pagination && (
        <CursorPagination
          canPrev={canPrev}
          canNext={canNext}
          onPrev={goPrev}
          onNext={goNext}
          totalCount={pagination.total_count ?? 0}
          shown={data.length}
        />
      )}
    </>
  );
}
