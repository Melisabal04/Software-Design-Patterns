import { useEffect, useMemo, useState } from "react";
import { api } from "../api/restwayApi";
import {
  ActionButton,
  AppShell,
  EmptyState,
  Field,
  Money,
  NavPills,
  NumberInput,
  PanelCard,
  SelectInput,
  StatCard,
  StatusBadge,
} from "../components/common";

const DEFAULT_TABLE_ID = 1;

export default function CustomerPage() {
  const [tableId, setTableId] = useState(DEFAULT_TABLE_ID);
  const [menuItems, setMenuItems] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewRating, setReviewRating] = useState("5");
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  async function loadAll() {
    try {
      setLoading(true);
      const [menuRes, dashboardRes] = await Promise.all([
        api.getMenuItems(),
        api.getTableDashboard(tableId),
      ]);
      setMenuItems(menuRes.data || []);
      setDashboard(dashboardRes.data || null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const timer = setInterval(loadAll, 15000);
    return () => clearInterval(timer);
  }, [tableId]);

  const categories = useMemo(() => {
    const values = [...new Set(menuItems.map((item) => item.category_name).filter(Boolean))];
    return ["all", ...values];
  }, [menuItems]);

  const filteredMenu = useMemo(() => {
    if (selectedCategory === "all") return menuItems;
    return menuItems.filter((item) => item.category_name === selectedCategory);
  }, [menuItems, selectedCategory]);

  const totalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  }, [cart]);

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((entry) => entry.id === item.id);
      if (existing) {
        return prev.map((entry) =>
          entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry
        );
      }

      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: 1,
        },
      ];
    });
  }

  function changeCartQty(id, quantity) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  }

  async function handlePlaceOrder() {
    if (cart.length === 0) {
      setMessage("Cart is empty.");
      return;
    }

    try {
      setSubmittingOrder(true);
      setMessage("");

      const activeSession = dashboard?.active_session;
      const payload = {
        table_id: Number(tableId),
        created_by_type: "customer",
        created_by_staff_id: null,
        order_type: activeSession ? "additional" : "initial",
        items: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
        })),
      };

      const res = await api.createOrder(payload);
      setMessage(`Order created. Delivery ID: ${res.data.delivery_pin}`);
      setCart([]);
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function handleCallWaiter() {
    try {
      await api.callWaiter(tableId, { request_type: "general_help" });
      setMessage("Waiter called successfully.");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleRequestPayment(orderId) {
    try {
      await api.requestPayment(orderId);
      setMessage("Payment requested successfully.");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleOpenReviews(menuItem, orderId = null) {
    try {
      setLoadingReviews(true);
      setReviewTarget(menuItem);
      setReviewOrderId(orderId);

      const res = await api.getMenuItemReviews(menuItem.id);
      setReviews(res.data || []);
    } catch (error) {
      setMessage(error.message);
      setReviewTarget(menuItem);
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
}

  function handleCloseReviews() {
    setReviewTarget(null);
    setReviews([]);
    setReviewRating("5");
    setReviewComment("");
    setReviewOrderId(null);
  }

  async function handleSubmitReview() {
    if (!reviewTarget || !reviewOrderId) return;

    try {
      setSubmittingReview(true);

      await api.createOrderItemReview(reviewOrderId, reviewTarget.id, {
        rating: Number(reviewRating),
        comment: reviewComment.trim() || null,
      });

      const res = await api.getMenuItemReviews(reviewTarget.id);
      setReviews(res.data || []);
      setReviewComment("");
      setReviewRating("5");
      setMessage("Review submitted successfully.");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmittingReview(false);
    }
}

  async function handleCancelOrder(orderId) {
    try {
      await api.cancelOrder(orderId);
      setMessage("Order cancelled successfully.");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const activeOrders = dashboard?.active_orders || [];
  const activeCalls = dashboard?.active_waiter_calls || [];
  const latestPayment = dashboard?.latest_payment || null;
  const tableInfo = dashboard?.table || null;
  const [reviewOrderId, setReviewOrderId] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  return (
    <>
    <AppShell
      title="Customer Table Screen"
      subtitle="Browse menu, place orders, call waiter, and request payment."
      accent="peach"
      actions={<NavPills />}
    >
      <div className="stack">
        <PanelCard title="Table Control" hint="Simple customer-side controls">
          <div className="inline-form">
            <Field label="Table ID">
              <NumberInput value={tableId} onChange={setTableId} min={1} />
            </Field>
            <Field label="Category">
              <SelectInput
                value={selectedCategory}
                onChange={setSelectedCategory}
                options={categories.map((value) => ({
                  value,
                  label: value === "all" ? "All categories" : value,
                }))}
              />
            </Field>
            <div className="button-row">
              <ActionButton variant="secondary" onClick={handleCallWaiter}>
                Call Waiter
              </ActionButton>
            </div>
          </div>

          {message ? <div className="message-box">{message}</div> : null}

          <div className="stats-grid">
            <StatCard label="Table" value={tableInfo?.table_number || tableId} tone="customer" />
            <StatCard
              label="Active Orders"
              value={activeOrders.length}
              tone="customer"
            />
            <StatCard
              label="Open Waiter Calls"
              value={activeCalls.length}
              tone="customer"
            />
            <StatCard
              label="Latest Payment"
              value={latestPayment?.status || "none"}
              tone="customer"
            />
          </div>
        </PanelCard>

        <PanelCard title="Menu" hint="Choose items and add them to cart">
          {loading ? (
            <EmptyState text="Loading menu..." />
          ) : (
            <div className="menu-grid">
              {filteredMenu.map((item) => (
                <div key={item.id} className="menu-card">
                    <img
                      src={item.image_url || "/menu/default.jpg"}
                      alt={item.name}
                      className="menu-item-image"
                      onClick={() => setPreviewImage(item.image_url || "/menu/default.jpg")}
                      style={{ cursor: "zoom-in" }}
                    />

                    <div className="menu-card-top">
                    <div>
                      <h3>{item.name}</h3>
                      <p className="muted">{item.category_name}</p>
                    </div>
                    <StatusBadge status={item.is_available ? "ready" : "Out of Stock"} />
                  </div>
                  <p className="menu-description">{item.description || "No description."}</p>
                  <div className="menu-meta">
                    <span><Money amount={item.price} /></span>
                    <span>⭐ {item.average_rating}</span>
                  </div>
                  <div className="button-row">
                    <ActionButton
                      onClick={() => addToCart(item)}
                      disabled={!item.is_available}
                    >
                      Add to Cart
                    </ActionButton>
                    <ActionButton
                      variant="ghost"
                      onClick={() => handleOpenReviews(item)}
                    >
                      Reviews
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>

      <div className="stack">
        <PanelCard title="Cart" hint="Review before sending the order">
          {cart.length === 0 ? (
            <EmptyState text="No items in cart yet." />
          ) : (
            <div className="stack gap-sm">
              {cart.map((item) => (
                <div key={item.id} className="list-row">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted">
                      <Money amount={item.price} /> each
                    </p>
                  </div>
                  <div className="qty-row">
                    <button onClick={() => changeCartQty(item.id, item.quantity - 1)}>-</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => changeCartQty(item.id, item.quantity + 1)}>+</button>
                  </div>
                </div>
              ))}

              <div className="total-box">
                Total: <strong><Money amount={totalAmount} /></strong>
              </div>

              <ActionButton onClick={handlePlaceOrder} disabled={submittingOrder}>
                {submittingOrder ? "Creating..." : "Place Order"}
              </ActionButton>
            </div>
          )}
        </PanelCard>

        <PanelCard title="Active Orders" hint="Track order progress and payment flow">
          {activeOrders.length === 0 ? (
            <EmptyState text="No active orders for this table." />
          ) : (
            <div className="stack gap-sm">
              {activeOrders.map((order) => (
                <div key={order.id} className="order-card">
                  <div className="list-row">
                    <div>
                      <h3>{order.order_number}</h3>
                      <p className="muted">
                        Type: {order.order_type} · Total: <Money amount={order.total_amount} />
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                {order.status !== "delivered" && order.status !== "paid" && (
                  <div className="order-card-info">
                    <div>
                      <span className="label-mini">Delivery ID</span>
                      <strong>{order.delivery_pin || "-"}</strong>
                    </div>
                    <div>
                      <span className="label-mini">Verified</span>
                      <strong>{order.delivery_pin_verified_at || "Not yet"}</strong>
                    </div>
                  </div>
                )}




                  <div className="order-items-list">
                    {(order.items || []).map((item) => (
                      <div key={item.id} className="order-item-line">
                        <span>
                          {item.menu_item_name} × {item.quantity}
                        </span>

                        <div className="button-row">
                          <strong>{Number(item.line_total).toFixed(2)} ₺</strong>

                          {order.status === "delivered" && (
                            <ActionButton
                              variant="ghost"
                              onClick={() =>
                                handleOpenReviews(
                                  {
                                    id: item.menu_item_id,
                                    name: item.menu_item_name,
                                  },
                                  order.id
                                )
                              }
                            >
                              Review
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                    {latestPayment?.order_id === order.id && latestPayment?.status === "rejected" && (
                    <div className="message-box">
                        Previous payment request was rejected. Please request payment again.
                    </div>
                    )}

                  <div className="button-row">
                    {order.status === "pending" && (
                      <ActionButton variant="ghost" onClick={() => handleCancelOrder(order.id)}>
                        Cancel
                      </ActionButton>
                    )}
                    {order.status === "delivered" && (
                        <ActionButton variant="secondary" onClick={() => handleRequestPayment(order.id)}>
                            {latestPayment?.order_id === order.id && latestPayment?.status === "rejected"
                            ? "Request Payment Again"
                            : "Request Payment"}
                        </ActionButton>
                        )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard title="Waiter Calls" hint="Open help or payment requests for this table">
          {activeCalls.length === 0 ? (
            <EmptyState text="No active waiter calls." />
          ) : (
            <div className="stack gap-sm">
              {activeCalls.map((call) => (
                <div key={call.id} className="order-card">
                  <div className="list-row">
                    <div>
                      <h3>
                        {call.request_type === "payment"
                          ? "Payment Request"
                          : call.request_type === "order_help"
                          ? "Order Help Request"
                          : "General Help Request"}
                      </h3>
                      <p className="muted">Created at: {call.created_at}</p>
                    </div>
                    <StatusBadge status={call.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
      {reviewTarget ? (
        <div className="overlay" onClick={handleCloseReviews}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="list-row">
              <div>
                <p className="eyebrow">Reviews</p>
                <h2>{reviewTarget.name}</h2>
              </div>
              <ActionButton variant="ghost" onClick={handleCloseReviews}>
                Close
              </ActionButton>
            </div>
            {reviewOrderId ? (
            <div className="review-form-box">
              
                <div className="inline-form">
                  <Field label="Rating">
                    <SelectInput
                      value={reviewRating}
                      onChange={setReviewRating}
                      options={[
                        { value: "5", label: "5" },
                        { value: "4", label: "4" },
                        { value: "3", label: "3" },
                        { value: "2", label: "2" },
                        { value: "1", label: "1" },
                      ]}
                    />
                  </Field>

                  <Field label="Comment">
                    <input
                      className="text-input"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Write a short comment"
                    />
                  </Field>



                  <div className="button-row">
                    <ActionButton onClick={handleSubmitReview} disabled={submittingReview}>
                      {submittingReview ? "Submitting..." : "Submit Review"}
                    </ActionButton>
                  </div>
                </div>
              
             </div>
            ) : null}
            {loadingReviews ? (
              <EmptyState text="Loading reviews..." />
            ) : reviews.length === 0 ? (
              <EmptyState text="No reviews found for this menu item." />
            ) : (
              <div className="stack gap-sm">
                {reviews.map((review) => (
                  <div key={review.id} className="review-card">
                    <div className="list-row">
                      <strong>⭐ {review.rating}</strong>
                      <span className="muted">{review.created_at}</span>
                    </div>
                    <p>{review.comment || "No comment."}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppShell>
    {previewImage && (
      <div className="overlay" onClick={() => setPreviewImage(null)}>
        <div className="image-preview-modal" onClick={(e) => e.stopPropagation()}>
          <img src={previewImage} alt="preview" />
        </div>
      </div>
    )}
    </>
  );
}