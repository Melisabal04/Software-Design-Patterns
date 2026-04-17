from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.database import execute_transaction, fetch_all, fetch_one

app = FastAPI(title="Restway Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OrderItemCreate(BaseModel):
    menu_item_id: int
    quantity: int = Field(..., gt=0)


class OrderCreateRequest(BaseModel):
    table_id: int
    created_by_type: Literal["customer", "waiter"]
    created_by_staff_id: int | None = None
    order_type: Literal["initial", "additional"] = "initial"
    items: list[OrderItemCreate]


@app.get("/api/health")
def health_check():
    result = fetch_one("SELECT 1 AS ok;")
    return {
        "success": True,
        "message": "Backend is running",
        "database": result,
    }


@app.get("/api/menu-items")
def get_menu_items():
    query = """
        SELECT
            mi.id,
            mi.name,
            mi.description,
            mi.price,
            mi.image_url,
            mi.is_available,
            c.name AS category_name,
            COALESCE(ROUND(AVG(mir.rating)::numeric, 1), 0.0) AS average_rating,
            COUNT(mir.id) AS review_count
        FROM menu_items mi
        JOIN categories c
            ON c.id = mi.category_id
        LEFT JOIN menu_item_reviews mir
            ON mir.menu_item_id = mi.id
        GROUP BY
            mi.id,
            mi.name,
            mi.description,
            mi.price,
            mi.image_url,
            mi.is_available,
            c.name
        ORDER BY c.name, mi.name;
    """
    items = fetch_all(query)
    return {
        "success": True,
        "count": len(items),
        "data": items,
    }


@app.get("/api/menu-items/{menu_item_id}/reviews")
def get_menu_item_reviews(menu_item_id: int):
    query = """
        SELECT
            id,
            menu_item_id,
            rating,
            comment,
            created_at
        FROM menu_item_reviews
        WHERE menu_item_id = %s
        ORDER BY created_at DESC;
    """
    reviews = fetch_all(query, (menu_item_id,))
    return {
        "success": True,
        "count": len(reviews),
        "data": reviews,
    }


@app.post("/api/orders")
def create_order(payload: OrderCreateRequest):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item.")

    if payload.created_by_type == "waiter" and payload.created_by_staff_id is None:
        raise HTTPException(
            status_code=400,
            detail="created_by_staff_id is required when created_by_type is 'waiter'.",
        )

    if payload.created_by_type == "customer" and payload.created_by_staff_id is not None:
        raise HTTPException(
            status_code=400,
            detail="created_by_staff_id must be null when created_by_type is 'customer'.",
        )

    table = fetch_one(
        """
        SELECT id, table_number, status
        FROM restaurant_tables
        WHERE id = %s;
        """,
        (payload.table_id,),
    )

    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    if payload.created_by_staff_id is not None:
        staff_user = fetch_one(
            """
            SELECT id, full_name, role, is_active
            FROM staff_users
            WHERE id = %s;
            """,
            (payload.created_by_staff_id,),
        )
        if not staff_user:
            raise HTTPException(status_code=404, detail="Staff user not found.")
        if not staff_user["is_active"]:
            raise HTTPException(status_code=400, detail="Staff user is not active.")

    menu_item_ids = [item.menu_item_id for item in payload.items]
    placeholders = ",".join(["%s"] * len(menu_item_ids))

    menu_items = fetch_all(
        f"""
        SELECT id, name, price, is_available
        FROM menu_items
        WHERE id IN ({placeholders});
        """,
        tuple(menu_item_ids),
    )

    menu_item_map = {item["id"]: item for item in menu_items}

    for item in payload.items:
        menu_item = menu_item_map.get(item.menu_item_id)
        if not menu_item:
            raise HTTPException(
                status_code=404,
                detail=f"Menu item with id {item.menu_item_id} not found.",
            )
        if not menu_item["is_available"]:
            raise HTTPException(
                status_code=400,
                detail=f"Menu item '{menu_item['name']}' is not available.",
            )

    def transaction_logic(conn, cur):
        cur.execute(
            """
            SELECT id
            FROM table_sessions
            WHERE table_id = %s AND status = 'active'
            ORDER BY started_at DESC
            LIMIT 1;
            """,
            (payload.table_id,),
        )
        active_session = cur.fetchone()

        if active_session:
            session_id = active_session["id"]
        else:
            cur.execute(
                """
                INSERT INTO table_sessions (table_id, status)
                VALUES (%s, 'active')
                RETURNING id;
                """,
                (payload.table_id,),
            )
            session_id = cur.fetchone()["id"]

        total_amount = Decimal("0.00")
        order_lines: list[dict] = []

        for item in payload.items:
            menu_item = menu_item_map[item.menu_item_id]
            unit_price = Decimal(str(menu_item["price"]))
            line_total = unit_price * item.quantity
            total_amount += line_total

            order_lines.append(
                {
                    "menu_item_id": item.menu_item_id,
                    "quantity": item.quantity,
                    "unit_price": unit_price,
                    "line_total": line_total,
                }
            )

        order_number = f"ORD-{payload.table_id}-{session_id}-{int(datetime.now().timestamp())}"

        cur.execute(
            """
            INSERT INTO orders (
                session_id,
                table_id,
                order_number,
                order_type,
                created_by_type,
                created_by_staff_id,
                status,
                total_amount,
                cancel_deadline
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                'pending',
                %s,
                CURRENT_TIMESTAMP + INTERVAL '5 minutes'
            )
            RETURNING id, created_at, cancel_deadline;
            """,
            (
                session_id,
                payload.table_id,
                order_number,
                payload.order_type,
                payload.created_by_type,
                payload.created_by_staff_id,
                total_amount,
            ),
        )
        created_order = cur.fetchone()
        order_id = created_order["id"]

        for line in order_lines:
            cur.execute(
                """
                INSERT INTO order_items (
                    order_id,
                    menu_item_id,
                    quantity,
                    unit_price,
                    line_total,
                    item_status
                )
                VALUES (%s, %s, %s, %s, %s, 'pending');
                """,
                (
                    order_id,
                    line["menu_item_id"],
                    line["quantity"],
                    line["unit_price"],
                    line["line_total"],
                ),
            )

        cur.execute(
            """
            INSERT INTO order_status_logs (
                order_id,
                old_status,
                new_status,
                changed_by_staff_id,
                note
            )
            VALUES (%s, NULL, 'pending', %s, %s);
            """,
            (
                order_id,
                payload.created_by_staff_id,
                "Order created",
            ),
        )

        cur.execute(
            """
            UPDATE restaurant_tables
            SET status = 'occupied'
            WHERE id = %s;
            """,
            (payload.table_id,),
        )

        cur.execute(
            """
            SELECT
                oi.id,
                oi.menu_item_id,
                mi.name AS menu_item_name,
                oi.quantity,
                oi.unit_price,
                oi.line_total,
                oi.item_status
            FROM order_items oi
            JOIN menu_items mi
                ON mi.id = oi.menu_item_id
            WHERE oi.order_id = %s
            ORDER BY oi.id;
            """,
            (order_id,),
        )
        created_items = cur.fetchall()

        return {
            "order_id": order_id,
            "session_id": session_id,
            "table_id": payload.table_id,
            "order_type": payload.order_type,
            "created_by_type": payload.created_by_type,
            "created_by_staff_id": payload.created_by_staff_id,
            "status": "pending",
            "total_amount": float(total_amount),
            "created_at": created_order["created_at"],
            "cancel_deadline": created_order["cancel_deadline"],
            "items": created_items,
        }

    result = execute_transaction(transaction_logic)

    return {
        "success": True,
        "message": "Order created successfully.",
        "data": result,
    }


@app.get("/api/tables/{table_id}/active-session")
def get_active_table_session(table_id: int):
    query = """
        SELECT
            ts.id AS session_id,
            ts.table_id,
            ts.started_at,
            ts.ended_at,
            ts.status
        FROM table_sessions ts
        WHERE ts.table_id = %s
          AND ts.status = 'active'
        ORDER BY ts.started_at DESC
        LIMIT 1;
    """
    session = fetch_one(query, (table_id,))
    if not session:
        raise HTTPException(status_code=404, detail="No active session found for this table.")
    return {
        "success": True,
        "data": session,
    }


@app.get("/api/sessions/{session_id}/orders")
def get_session_orders(session_id: int):
    query = """
        SELECT
            o.id,
            o.order_number,
            o.order_type,
            o.created_by_type,
            o.created_by_staff_id,
            o.status,
            o.total_amount,
            o.cancel_deadline,
            o.created_at,
            o.updated_at
        FROM orders o
        WHERE o.session_id = %s
        ORDER BY o.created_at DESC;
    """
    orders = fetch_all(query, (session_id,))
    return {
        "success": True,
        "count": len(orders),
        "data": orders,
    }


@app.post("/api/orders/{order_id}/cancel")
def cancel_order(order_id: int):
    order = fetch_one(
        """
        SELECT
            id,
            status,
            cancel_deadline
        FROM orders
        WHERE id = %s;
        """,
        (order_id,),
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if order["status"] == "cancelled":
     raise HTTPException(status_code=400, detail="Order is already cancelled.")

    if order["status"] == "paid":
        raise HTTPException(status_code=400, detail="Paid orders cannot be cancelled.")

    if order["status"] in ["preparing", "ready", "delivered"]:
        raise HTTPException(
            status_code=400,
            detail="Order already being processed, cannot cancel.",
        )

    cancel_deadline = order["cancel_deadline"]
    now = datetime.now(timezone.utc)

    if cancel_deadline.tzinfo is None:
        cancel_deadline = cancel_deadline.replace(tzinfo=timezone.utc)

    if now > cancel_deadline:
        raise HTTPException(
            status_code=400,
            detail="Cancel time window expired (5 minutes).",
        )

    def tx(conn, cur):
        cur.execute(
            """
            UPDATE orders
            SET status = 'cancelled',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (order_id,),
        )

        cur.execute(
            """
            UPDATE order_items
            SET item_status = 'cancelled'
            WHERE order_id = %s;
            """,
            (order_id,),
        )

        cur.execute(
            """
            INSERT INTO order_status_logs (
                order_id,
                old_status,
                new_status,
                note
            )
            VALUES (%s, %s, 'cancelled', %s);
            """,
            (order_id, order["status"], "Order cancelled by user"),
        )

    execute_transaction(tx)

    return {
        "success": True,
        "message": "Order cancelled successfully.",
    }

@app.get("/api/orders/{order_id}")
def get_order_detail(order_id: int):
    order = fetch_one(
        """
        SELECT
            id,
            session_id,
            table_id,
            order_number,
            order_type,
            created_by_type,
            created_by_staff_id,
            status,
            total_amount,
            cancel_deadline,
            created_at,
            updated_at
        FROM orders
        WHERE id = %s;
        """,
        (order_id,),
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    items = fetch_all(
        """
        SELECT
            oi.id,
            oi.menu_item_id,
            mi.name AS menu_item_name,
            oi.quantity,
            oi.unit_price,
            oi.line_total,
            oi.item_status,
            oi.created_at
        FROM order_items oi
        JOIN menu_items mi
            ON mi.id = oi.menu_item_id
        WHERE oi.order_id = %s
        ORDER BY oi.id;
        """,
        (order_id,),
    )

    return {
        "success": True,
        "data": {
            **order,
            "items": items,
        },
    }

@app.post("/api/orders/{order_id}/status")
def update_order_status(order_id: int, new_status: str):
    valid_statuses = ["preparing", "ready", "delivered"]

    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status.")

    order = fetch_one(
        """
        SELECT id, status
        FROM orders
        WHERE id = %s;
        """,
        (order_id,),
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    current_status = order["status"]

    allowed_transitions = {
        "pending": "preparing",
        "preparing": "ready",
        "ready": "delivered"
    }

    if current_status not in allowed_transitions:
        raise HTTPException(status_code=400, detail="Invalid current state.")

    if allowed_transitions[current_status] != new_status:
        raise HTTPException(status_code=400, detail="Invalid status transition.")

    def tx(conn, cur):

        # 1️⃣ Eğer preparing'e geçiyorsa stok düş
        if new_status == "preparing":
            cur.execute(
                """
                SELECT menu_item_id, quantity
                FROM order_items
                WHERE order_id = %s;
                """,
                (order_id,),
            )
            items = cur.fetchall()

            for item in items:
                cur.execute(
                    """
                    SELECT ingredient_id, quantity_needed
                    FROM menu_item_ingredients
                    WHERE menu_item_id = %s;
                    """,
                    (item["menu_item_id"],),
                )
                ingredients = cur.fetchall()

                for ing in ingredients:
                    total_needed = ing["quantity_needed"] * item["quantity"]

                    cur.execute(
                        """
                        UPDATE ingredients
                        SET stock_quantity = stock_quantity - %s
                        WHERE id = %s;
                        """,
                        (total_needed, ing["ingredient_id"]),
                    )

        # 2️⃣ Order status update
        cur.execute(
            """
            UPDATE orders
            SET status = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (new_status, order_id),
        )

        # 3️⃣ Order item status update
        cur.execute(
            """
            UPDATE order_items
            SET item_status = %s
            WHERE order_id = %s;
            """,
            (new_status, order_id),
        )

        # 4️⃣ Log
        cur.execute(
            """
            INSERT INTO order_status_logs (
                order_id,
                old_status,
                new_status,
                note
            )
            VALUES (%s, %s, %s, %s);
            """,
            (order_id, current_status, new_status, "Status updated"),
        )

        # 5️⃣ Eğer ready olduysa notification oluştur
        if new_status == "ready":
            cur.execute(
                """
                INSERT INTO notifications (
                    recipient_staff_id,
                    type,
                    title,
                    message,
                    related_order_id
                )
                VALUES (
                    1,
                    'order_ready',
                    'Order Ready',
                    'Order is ready for delivery',
                    %s
                );
                """,
                (order_id,),
            )

    execute_transaction(tx)

    return {
        "success": True,
        "message": f"Order updated to {new_status}"
    }

@app.post("/api/orders/{order_id}/deliver")
def deliver_order(order_id: int, waiter_id: int, pin: str):

    order = fetch_one(
        """
        SELECT id, status
        FROM orders
        WHERE id = %s;
        """,
        (order_id,),
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if order["status"] != "ready":
        raise HTTPException(
            status_code=400,
            detail="Order must be in 'ready' state to deliver.",
        )

    waiter = fetch_one(
        """
        SELECT id, pin_code, is_active
        FROM staff_users
        WHERE id = %s AND role = 'waiter';
        """,
        (waiter_id,),
    )

    if not waiter:
        raise HTTPException(status_code=404, detail="Waiter not found.")

    if not waiter["is_active"]:
        raise HTTPException(status_code=400, detail="Waiter is not active.")

    is_correct = waiter["pin_code"] == pin

    def tx(conn, cur):

        # PIN log
        cur.execute(
            """
            INSERT INTO delivery_verifications (
                order_id,
                waiter_id,
                entered_pin,
                is_successful
            )
            VALUES (%s, %s, %s, %s);
            """,
            (order_id, waiter_id, pin, is_correct),
        )

        if not is_correct:
            return

        # order status update
        cur.execute(
            """
            UPDATE orders
            SET status = 'delivered',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (order_id,),
        )

        # order items
        cur.execute(
            """
            UPDATE order_items
            SET item_status = 'delivered'
            WHERE order_id = %s;
            """,
            (order_id,),
        )

        # log
        cur.execute(
            """
            INSERT INTO order_status_logs (
                order_id,
                old_status,
                new_status,
                note
            )
            VALUES (%s, %s, 'delivered', %s);
            """,
            (order_id, "ready", "Order delivered"),
        )

    execute_transaction(tx)

    if not is_correct:
        raise HTTPException(status_code=400, detail="Invalid PIN.")

    return {
        "success": True,
        "message": "Order delivered successfully."
    }

@app.post("/api/orders/{order_id}/request-payment")
def request_payment(order_id: int):
    order = fetch_one(
        """
        SELECT
            o.id,
            o.session_id,
            o.table_id,
            o.status,
            o.total_amount
        FROM orders o
        WHERE o.id = %s;
        """,
        (order_id,),
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if order["status"] != "delivered":
        raise HTTPException(
            status_code=400,
            detail="Payment can only be requested after delivery.",
        )

    existing_pending_payment = fetch_one(
        """
        SELECT id
        FROM payments
        WHERE order_id = %s AND status = 'pending';
        """,
        (order_id,),
    )

    if existing_pending_payment:
        raise HTTPException(
            status_code=400,
            detail="Payment request already exists for this order.",
        )

    def tx(conn, cur):
        cur.execute(
            """
            INSERT INTO waiter_calls (
                session_id,
                table_id,
                request_type,
                status
            )
            VALUES (%s, %s, 'payment', 'pending');
            """,
            (order["session_id"], order["table_id"]),
        )

        cur.execute(
            """
            INSERT INTO payments (
                order_id,
                session_id,
                table_id,
                payment_method,
                status,
                amount
            )
            VALUES (%s, %s, %s, 'card', 'pending', %s)
            RETURNING id;
            """,
            (
                order["id"],
                order["session_id"],
                order["table_id"],
                order["total_amount"],
            ),
        )
        payment = cur.fetchone()

        cur.execute(
            """
            INSERT INTO notifications (
                recipient_staff_id,
                type,
                title,
                message,
                related_order_id,
                related_table_id
            )
            VALUES (
                1,
                'payment_request',
                'Payment Request',
                'Table requested payment.',
                %s,
                %s
            );
            """,
            (order["id"], order["table_id"]),
        )

        return {
            "payment_id": payment["id"],
            "order_id": order["id"],
            "session_id": order["session_id"],
            "table_id": order["table_id"],
            "amount": float(order["total_amount"]),
            "status": "pending",
        }

    result = execute_transaction(tx)

    return {
        "success": True,
        "message": "Payment request created successfully.",
        "data": result,
    }

@app.post("/api/orders/{order_id}/pay")
def pay_order(order_id: int, waiter_id: int, pin: str, payment_method: str = "card"):
    if payment_method not in ["card", "cash"]:
        raise HTTPException(status_code=400, detail="Invalid payment method.")

    order = fetch_one(
        """
        SELECT
            id,
            session_id,
            table_id,
            status,
            total_amount
        FROM orders
        WHERE id = %s;
        """,
        (order_id,),
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    if order["status"] != "delivered":
        raise HTTPException(
            status_code=400,
            detail="Only delivered orders can be paid.",
        )

    waiter = fetch_one(
        """
        SELECT id, pin_code, is_active
        FROM staff_users
        WHERE id = %s AND role = 'waiter';
        """,
        (waiter_id,),
    )

    if not waiter:
        raise HTTPException(status_code=404, detail="Waiter not found.")

    if not waiter["is_active"]:
        raise HTTPException(status_code=400, detail="Waiter is not active.")

    payment = fetch_one(
        """
        SELECT id, status
        FROM payments
        WHERE order_id = %s
        ORDER BY created_at DESC
        LIMIT 1;
        """,
        (order_id,),
    )

    if not payment:
        raise HTTPException(status_code=404, detail="No payment request found for this order.")

    if payment["status"] == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid.")

    is_correct = waiter["pin_code"] == pin

    def tx(conn, cur):
        if not is_correct:
            cur.execute(
                """
                UPDATE payments
                SET confirmation_pin = %s
                WHERE id = %s;
                """,
                (pin, payment["id"]),
            )
            return

        cur.execute(
            """
            UPDATE payments
            SET payment_method = %s,
                status = 'paid',
                confirmed_by_waiter_id = %s,
                confirmation_pin = %s,
                paid_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (payment_method, waiter_id, pin, payment["id"]),
        )

        cur.execute(
            """
            UPDATE orders
            SET status = 'paid',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (order_id,),
        )

        cur.execute(
            """
            INSERT INTO order_status_logs (
                order_id,
                old_status,
                new_status,
                note
            )
            VALUES (%s, %s, 'paid', %s);
            """,
            (order_id, "delivered", "Payment received"),
        )

        cur.execute(
            """
            UPDATE waiter_calls
            SET status = 'completed',
                handled_by_staff_id = %s,
                handled_at = CURRENT_TIMESTAMP
            WHERE table_id = %s
              AND request_type = 'payment'
              AND status IN ('pending', 'seen');
            """,
            (waiter_id, order["table_id"]),
        )

        cur.execute(
            """
            UPDATE table_sessions
            SET status = 'closed',
                ended_at = CURRENT_TIMESTAMP
            WHERE id = %s;
            """,
            (order["session_id"],),
        )

        cur.execute(
            """
            UPDATE restaurant_tables
            SET status = 'available'
            WHERE id = %s;
            """,
            (order["table_id"],),
        )

    execute_transaction(tx)

    if not is_correct:
        raise HTTPException(status_code=400, detail="Invalid PIN.")

    return {
        "success": True,
        "message": "Payment completed successfully.",
    }

@app.get("/api/tables/{table_id}")
def get_table_detail(table_id: int):
    table = fetch_one(
        """
        SELECT
            id,
            table_number,
            name,
            status,
            created_at
        FROM restaurant_tables
        WHERE id = %s;
        """,
        (table_id,),
    )

    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    return {
        "success": True,
        "data": table,
    }