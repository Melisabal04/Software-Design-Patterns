import CustomerPage from "./pages/CustomerPage";
import KitchenPage from "./pages/KitchenPage";
import WaiterPage from "./pages/WaiterPage";

function HomeLauncher() {
  return (
    <div className="launcher-page">
      <div className="launcher-card">
        <p className="eyebrow">Restway</p>
        <h1>Panel Launcher</h1>
        <p className="subtitle">
          Choose which interface you want to open.
        </p>

        <div className="launcher-grid">
          <a className="launcher-link customer" href="/customer">
            Customer Table Screen
          </a>
          <a className="launcher-link kitchen" href="/kitchen">
            Kitchen Panel
          </a>
          <a className="launcher-link waiter" href="/waiter">
            Waiter Panel
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;

  if (path === "/customer") return <CustomerPage />;
  if (path === "/kitchen") return <KitchenPage />;
  if (path === "/waiter") return <WaiterPage />;

  return <HomeLauncher />;
}