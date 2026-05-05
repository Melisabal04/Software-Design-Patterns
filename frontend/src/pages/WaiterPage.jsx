import { useEffect, useState } from "react";
import { api } from "../api/restwayApi";
import {
  ActionButton,
  AppShell,
  EmptyState,
  Field,
  NavPills,
  PanelCard,
  StatCard,
  StatusBadge,
  TextInput,
} from "../components/common";

export default function WaiterPage() {
  const [dashboard, setDashboard] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [message, setMessage] = useState("");

  const [waiterId, setWaiterId] = useState("1");
  const [waiterPin, setWaiterPin] = useState("");
  const [deliveryPins, setDeliveryPins] = useState({});

  const [orderTableId, setOrderTableId] = useState("");
  const [selectedMenuItemId, setSelectedMenuItemId] = useState("");
  const [orderQuantity, setOrderQuantity] = useState("1");

  const [fromTableId, setFromTableId] = useState("");
  const [toTableId, setToTableId] = useState("");

  async function loadData() {
    try {
      const dashboardRes = await api.getWaiterDashboard();
      setDashboard(dashboardRes.data || null);

      const menuRes = await api.getMenuItems();
      setMenuItems(menuRes.data || []);
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, []);

  async function markSeen(callId) {
    try {
      await api.markWaiterCallSeen(callId, { staff_id: Number(waiterId) });
      setMessage("Waiter call marked as seen.");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function completeCall(callId) {
    try {
      await api.completeWaiterCall(callId, { staff_id: Number(waiterId) });
      setMessage("Waiter call completed.");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deliverOrder(orderId) {
    try {
      await api.deliverOrder(orderId, {
        waiter_id: Number(waiterId),
        delivery_pin: deliveryPins[orderId] || "",
      });
      setMessage("Order delivered successfully.");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function completePayment(orderId) {
    try {
      await api.payOrder(orderId, {
        waiter_id: Number(waiterId),
        pin: waiterPin,
        payment_method: "card",
      });
      setMessage("Payment completed successfully.");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function markNotificationRead(notificationId) {
    try {
      await api.markNotificationAsRead(notificationId);
      setMessage("Notification marked as read.");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

async function createWaiterOrder() {
  try {
    if (!orderTableId) {
      setMessage("Please enter table ID.");
      return;
    }

    if (!selectedMenuItemId) {
      setMessage("Please select a menu item.");
      return;
    }

    if (!orderQuantity || Number(orderQuantity) <= 0) {
      setMessage("Quantity must be greater than 0.");
      return;
    }

    // 🔥 BURASI ÖNEMLİ
    let session = null;

    try {
      const res = await api.getActiveSession(Number(orderTableId));
      session = res.data;
    } catch (e) {
      session = null;
    }

    const orderType = session ? "additional" : "initial";

    // 🔥 BURASI ÖNEMLİ
    await api.createOrder({
      table_id: Number(orderTableId),
      created_by_type: "waiter",
      created_by_staff_id: Number(waiterId),
      order_type: orderType,
      items: [
        {
          menu_item_id: Number(selectedMenuItemId),
          quantity: Number(orderQuantity),
        },
      ],
    });

    setMessage(`Order created successfully (${orderType}).`);

    setOrderTableId("");
    setSelectedMenuItemId("");
    setOrderQuantity("1");

    await loadData();
  } catch (error) {
    setMessage(error.message);
  }
}

  async function moveTable() {
    try {
      if (!fromTableId) {
        setMessage("Please enter old table ID.");
        return;
      }

      if (!toTableId) {
        setMessage("Please enter new table ID.");
        return;
      }

      await api.moveTable({
        from_table_id: Number(fromTableId),
        to_table_id: Number(toTableId),
        waiter_id: Number(waiterId),
      });

      setMessage("Table changed successfully.");
      setFromTableId("");
      setToTableId("");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const pendingCalls = dashboard?.pending_calls || [];
  const readyOrders = dashboard?.ready_orders || [];
  const pendingPayments = dashboard?.pending_payments || [];
  const unreadNotifications = dashboard?.unread_notifications || [];

  return (
    <AppShell
      title="Waiter Panel"
      subtitle="Handle calls, delivery verification, payment completion, table change, and waiter-side orders."
      accent="mint"
      actions={<NavPills />}
    >
      <div className="stack">
        <PanelCard title="Waiter Controls" hint="Basic waiter identity inputs">
          <div className="inline-form">
            <Field label="Waiter ID">
              <TextInput value={waiterId} onChange={setWaiterId} placeholder="1" />
            </Field>

            <Field label="Waiter PIN">
              <TextInput
                value={waiterPin}
                onChange={setWaiterPin}
                placeholder="Waiter PIN for payment"
              />
            </Field>
          </div>

          {message ? <div className="message-box">{message}</div> : null}

          <div className="stats-grid">
            <StatCard label="Calls" value={pendingCalls.length} tone="waiter" />
            <StatCard label="Ready Orders" value={readyOrders.length} tone="waiter" />
            <StatCard label="Pending Payments" value={pendingPayments.length} tone="waiter" />
            <StatCard label="Unread Notifications" value={unreadNotifications.length} tone="waiter" />
          </div>
        </PanelCard>

        <PanelCard title="Create Order For Table" hint="Waiter can create an order for any table">
          <div className="inline-form">
            <Field label="Table ID">
              <TextInput
                value={orderTableId}
                onChange={setOrderTableId}
                placeholder="Example: 1"
              />
            </Field>

            <Field label="Menu Item">
              <select
                className="text-input"
                value={selectedMenuItemId}
                onChange={(event) => setSelectedMenuItemId(event.target.value)}
              >
                <option value="">Select menu item</option>
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {Number(item.price).toFixed(2)} ₺
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Quantity">
              <TextInput
                value={orderQuantity}
                onChange={setOrderQuantity}
                placeholder="1"
              />
            </Field>
          </div>

          <ActionButton onClick={createWaiterOrder}>
            Create Order
          </ActionButton>
        </PanelCard>

        <PanelCard title="Change Table" hint="Move active session, orders, calls, and payments to another table">
          <div className="inline-form">
            <Field label="Old Table ID">
              <TextInput
                value={fromTableId}
                onChange={setFromTableId}
                placeholder="Current table"
              />
            </Field>

            <Field label="New Table ID">
              <TextInput
                value={toTableId}
                onChange={setToTableId}
                placeholder="New table"
              />
            </Field>
          </div>

          <ActionButton onClick={moveTable}>
            Change Table
          </ActionButton>
        </PanelCard>

        <PanelCard title="Waiter Calls" hint="Help and payment calls from tables">
          {pendingCalls.length === 0 ? (
            <EmptyState text="No waiter calls right now." />
          ) : (
            <div className="stack gap-sm">
              {pendingCalls.map((call) => (
                <div key={call.id} className="order-card">
                  <div className="list-row">
                    <div>
                      <h3>Table {call.table_number}</h3>
                      <p className="muted">
                        Request:{" "}
                        {call.request_type === "payment"
                          ? "Payment"
                          : call.request_type === "order_help"
                          ? "Order Help"
                          : "General Help"}
                      </p>
                    </div>
                    <StatusBadge status={call.status} />
                  </div>

                  <div className="button-row">
                    {call.request_type !== "payment" && call.status === "pending" && (
                      <ActionButton variant="secondary" onClick={() => markSeen(call.id)}>
                        Mark Seen
                      </ActionButton>
                    )}

                    {call.request_type !== "payment" && (
                      <ActionButton variant="ghost" onClick={() => completeCall(call.id)}>
                        Complete
                      </ActionButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>

      <div className="stack">
        <PanelCard title="Ready Orders" hint="Use customer delivery PIN to confirm handoff">
          {readyOrders.length === 0 ? (
            <EmptyState text="No ready orders waiting for delivery." />
          ) : (
            <div className="stack gap-sm">
              {readyOrders.map((order) => (
                <div key={order.id} className="order-card">
                  <div className="list-row">
                    <div>
                      <h3>{order.order_number}</h3>
                      <p className="muted">Table {order.table_number}</p>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                  <Field label="Customer Delivery ID">
                    <TextInput
                      value={deliveryPins[order.id] || ""}
                      onChange={(value) =>
                        setDeliveryPins((prev) => ({ ...prev, [order.id]: value }))
                      }
                      placeholder="Enter delivery ID"
                    />
                  </Field>

                  <ActionButton onClick={() => deliverOrder(order.id)}>
                    Deliver Order
                  </ActionButton>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard title="Pending Payments" hint="Confirm payment after waiter verification">
          {pendingPayments.length === 0 ? (
            <EmptyState text="No pending payments." />
          ) : (
            <div className="stack gap-sm">
              {pendingPayments.map((payment) => (
                <div key={payment.id} className="order-card">
                  <div className="list-row">
                    <div>
                      <h3>Payment #{payment.id}</h3>
                      <p className="muted">
                        Table {payment.table_number} · Order {payment.order_id}
                      </p>
                    </div>
                    <StatusBadge status={payment.status} />
                  </div>

                  <p className="muted">Amount: {Number(payment.amount).toFixed(2)} ₺</p>

                  <ActionButton onClick={() => completePayment(payment.order_id)}>
                    Complete Payment
                  </ActionButton>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard title="Notifications" hint="Unread waiter-side notifications">
          {unreadNotifications.length === 0 ? (
            <EmptyState text="No unread notifications." />
          ) : (
            <div className="stack gap-sm">
              {unreadNotifications.map((notification) => (
                <div key={notification.id} className="order-card">
                  <div className="list-row">
                    <div>
                      <h3>{notification.title}</h3>
                      <p className="muted">{notification.message}</p>
                    </div>
                    <StatusBadge status={notification.is_read ? "ready" : "pending"} />
                  </div>

                  <div className="button-row">
                    <ActionButton
                      variant="ghost"
                      onClick={() => markNotificationRead(notification.id)}
                    >
                      Mark as Read
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
    </AppShell>
  );
}