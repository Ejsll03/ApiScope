import { AuthGate } from "./auth/AuthGate/AuthGate.jsx";
import { AppShell } from "./layout/AppShell/AppShell.jsx";
import { useHashRoute } from "./router/useHashRoute.js";
import { DashboardPage } from "./dashboard/DashboardPage/DashboardPage.jsx";
import { RequestsPage } from "./requests/RequestsPage/RequestsPage.jsx";
import { RequestDetailPage } from "./detail/RequestDetailPage/RequestDetailPage.jsx";

export default function App() {
  const route = useHashRoute();

  return (
    <AuthGate>
      {({ logout, isAnonymous }) => (
        <AppShell route={route} onNavigate={route.navigate} onLogout={isAnonymous ? null : logout}>
          {route.page === "requests" && route.param && (
            <RequestDetailPage id={route.param} onBack={() => route.navigate("requests")} />
          )}
          {route.page === "requests" && !route.param && (
            <RequestsPage onSelect={(id) => route.navigate("requests", id)} />
          )}
          {route.page !== "requests" && <DashboardPage onNavigate={route.navigate} />}
        </AppShell>
      )}
    </AuthGate>
  );
}
