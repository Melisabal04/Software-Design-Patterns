const API_BASE = "http://127.0.0.1:8000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || "Request failed.");
  }

  return data;
}

export const api = {
  health: () => request("/health"),

  getMenuItems: () => request("/menu-items"),
  getMenuItemReviews: (menuItemId) => request(`/menu-items/${menuItemId}/reviews`),

  createOrder: (payload) =>
    request("/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getOrderDetail: (orderId) => request(`/orders/${orderId}`),

  cancelOrder: (orderId) =>
    request(`/orders/${orderId}/cancel`, {
      method: "POST",
    }),

  requestPayment: (orderId) =>
    request(`/orders/${orderId}/request-payment`, {
      method: "POST",
    }),

  updateOrderStatus: (orderId, payload) =>
    request(`/orders/${orderId}/status`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  deliverOrder: (orderId, payload) =>
    request(`/orders/${orderId}/deliver`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  payOrder: (orderId, payload) =>
    request(`/orders/${orderId}/pay`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getTableDashboard: (tableId) => request(`/tables/${tableId}/dashboard`),
  getTableDetail: (tableId) => request(`/tables/${tableId}`),
  getActiveSession: (tableId) => request(`/tables/${tableId}/active-session`),
  getSessionOrders: (sessionId) => request(`/sessions/${sessionId}/orders`),

  callWaiter: (tableId, payload) =>
    request(`/tables/${tableId}/call-waiter`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getKitchenOrders: (status) =>
    request(`/kitchen/orders${status ? `?status=${status}` : ""}`),

  getKitchenOrderDetail: (orderId) => request(`/kitchen/orders/${orderId}`),
  getKitchenIngredients: () => request("/kitchen/ingredients"),
  createKitchenIngredient: (payload) =>
    request("/kitchen/ingredients", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getWaiterDashboard: () => request("/waiter/dashboard"),

  moveTable: (payload) =>
    request("/waiter/move-table", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getWaiterCalls: (params = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set("status", params.status);
    if (params.request_type) search.set("request_type", params.request_type);
    const qs = search.toString();
    return request(`/waiter/calls${qs ? `?${qs}` : ""}`);
  },

  markWaiterCallSeen: (callId, payload) =>
    request(`/waiter/calls/${callId}/seen`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  completeWaiterCall: (callId, payload) =>
    request(`/waiter/calls/${callId}/complete`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getWaiterReadyOrders: () => request("/waiter/orders-ready"),
  getWaiterPendingPayments: () => request("/waiter/payments-pending"),

  getStaffNotifications: (staffId) => request(`/staff/${staffId}/notifications`),
  markNotificationAsRead: (notificationId) =>
    request(`/notifications/${notificationId}/read`, {
      method: "POST",
    }),
  createOrderItemReview: (orderId, menuItemId, payload) =>
  request(`/orders/${orderId}/items/${menuItemId}/review`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
};