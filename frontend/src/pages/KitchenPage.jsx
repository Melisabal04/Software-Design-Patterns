import { useEffect, useState } from "react";
import { api } from "../api/restwayApi";
import {
  ActionButton,
  AppShell,
  EmptyState,
  NavPills,
  PanelCard,
  StatCard,
  StatusBadge,
} from "../components/common";

export default function KitchenPage() {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [preparingOrders, setPreparingOrders] = useState([]);
  const [readyOrders, setReadyOrders] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  async function loadData() {
    try {
      const [pending, preparing, ready, ingredientsRes] = await Promise.all([
        api.getKitchenOrders("pending"),
        api.getKitchenOrders("preparing"),
        api.getKitchenOrders("ready"),
        api.getKitchenIngredients(),
      ]);

      setPendingOrders(pending.data || []);
      setPreparingOrders(preparing.data || []);
      setReadyOrders(ready.data || []);
      setIngredients(ingredientsRes.data || []);
    } catch (error) {
      setMessage(error.message);
    }
  }
  async function openOrderDetail(orderId) {
    try {
      const res = await api.getKitchenOrderDetail(orderId);
      setSelectedOrder(orderId);
      setSelectedOrderDetail(res.data || null);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function closeOrderDetail() {
    setSelectedOrder(null);
    setSelectedOrderDetail(null);
  }

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, []);

  async function updateStatus(orderId, newStatus) {
    try {
      await api.updateOrderStatus(orderId, {
        new_status: newStatus,
        changed_by_staff_id: 2,
        note: `Kitchen changed order to ${newStatus}`,
      });
      setMessage(`Order updated to ${newStatus}.`);
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function renderOrderCard(order, nextAction) {
    return (
      <div key={order.id} className="order-card kitchen-card">
        <div className="list-row">
          <div>
            <h3>{order.order_number}</h3>
            <p className="muted">
              Table {order.table_number} · {order.item_count} items
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="order-card-info">
          <div>
            <span className="label-mini">Order ID</span>
            <strong>{order.id}</strong>
          </div>
          <div>
            <span className="label-mini">Total</span>
            <strong>{Number(order.total_amount).toFixed(2)} ₺</strong>
          </div>
        </div>

        <div className="button-row">
          <ActionButton variant="ghost" onClick={() => openOrderDetail(order.id)}>
            View Details
          </ActionButton>
          {nextAction ? (
            <ActionButton onClick={() => updateStatus(order.id, nextAction.value)}>
              {nextAction.label}
            </ActionButton>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <AppShell
      title="Kitchen Panel"
      subtitle="Manage pending and preparing orders from the kitchen side."
      accent="lavender"
      actions={<NavPills />}
    >
      <div className="stack full-span">
        <PanelCard title="Kitchen Overview" hint="Fast order pipeline status">
          {message ? <div className="message-box">{message}</div> : null}
          <div className="stats-grid">
            <StatCard label="Pending" value={pendingOrders.length} tone="kitchen" />
            <StatCard label="Preparing" value={preparingOrders.length} tone="kitchen" />
            <StatCard label="Ready" value={readyOrders.length} tone="kitchen" />
            <StatCard
              label="Total Active"
              value={pendingOrders.length + preparingOrders.length + readyOrders.length}
              tone="kitchen"
            />
          </div>

          <div className="ingredient-strip">
            {ingredients.slice(0, 8).map((ingredient) => (
              <div key={ingredient.id} className="ingredient-pill">
                <span>{ingredient.name}</span>
                <strong>
                  {ingredient.stock_quantity} {ingredient.unit}
                </strong>
              </div>
            ))}
          </div>
        </PanelCard>
        <div className="triple-grid">
          <PanelCard title="Pending Orders" hint="Orders waiting to be started">
            {pendingOrders.length === 0 ? (
              <EmptyState text="No pending orders." />
            ) : (
              <div className="stack gap-sm">
                {pendingOrders.map((order) =>
                  renderOrderCard(order, { label: "Start Preparing", value: "preparing" })
                )}
              </div>
            )}
          </PanelCard>

          <PanelCard title="Preparing Orders" hint="Orders currently in progress">
            {preparingOrders.length === 0 ? (
              <EmptyState text="No preparing orders." />
            ) : (
              <div className="stack gap-sm">
                {preparingOrders.map((order) =>
                  renderOrderCard(order, { label: "Mark Ready", value: "ready" })
                )}
              </div>
            )}
          </PanelCard>

          <PanelCard title="Ready Orders" hint="Orders prepared and waiting for waiter">
            {readyOrders.length === 0 ? (
              <EmptyState text="No ready orders." />
            ) : (
              <div className="stack gap-sm">
                {readyOrders.map((order) => renderOrderCard(order, null))}
              </div>
            )}
          </PanelCard>
        </div>
      </div>
      {selectedOrderDetail ? (
        <div className="overlay" onClick={closeOrderDetail}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="list-row">
              <div>
                <p className="eyebrow">Kitchen Detail</p>
                <h2>{selectedOrderDetail.order_number}</h2>
                <p className="muted">
                  Table {selectedOrderDetail.table_number} · {selectedOrderDetail.status}
                </p>
              </div>
              <ActionButton variant="ghost" onClick={closeOrderDetail}>
                Close
              </ActionButton>
            </div>

            <div className="stack gap-sm">
              {(selectedOrderDetail.items || []).map((item) => (
                <div key={item.id} className="review-card">
                  <div className="list-row">
                    <strong>{item.menu_item_name}</strong>
                    <StatusBadge status={item.item_status} />
                  </div>
                  <p className="muted">
                    Quantity: {item.quantity} · Unit: {Number(item.unit_price).toFixed(2)} ₺
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}