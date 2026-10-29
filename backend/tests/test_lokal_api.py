# LOKAL MILITAR ERP - backend regression tests (open access, users, products, stock, orders, desmontagem, trocas, commissions, crud, settings)
import os
import uuid
import io
import zipfile
from urllib.parse import urlparse
import pytest
import requests

def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8765")
    if urlparse(url).hostname not in {"localhost", "127.0.0.1", "::1"} and os.environ.get("ALLOW_REMOTE_TEST_BACKEND") != "true":
        raise RuntimeError("Tests refuse remote backends by default; use a local test API or explicitly set ALLOW_REMOTE_TEST_BACKEND=true")
    return url.rstrip("/")

BASE_URL = _base()
CREATED = {"products": [], "orders": [], "users": [], "customers": [], "suppliers": [], "categories": [], "expenses": [], "vehicles": []}


@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    yield s
    for coll, ids in CREATED.items():
        for i in ids:
            path = "auth/users" if coll == "users" else coll
            s.delete(f"{BASE_URL}/api/{path}/{i}")


def _prod(admin, name, sizes, **kw):
    sku = "TEST_" + uuid.uuid4().hex[:6]
    r = admin.post(f"{BASE_URL}/api/products", json={"name": name, "sku": sku, "price": 100, "cost": 50,
                                                      "sizes": sizes, **kw})
    assert r.status_code == 200, r.text
    CREATED["products"].append(r.json()["id"])
    return r.json()


def _stock(admin, pid, size):
    p = admin.get(f"{BASE_URL}/api/products").json()
    p = next(x for x in p if x["id"] == pid)
    for s in p["sizes"]:
        if s["size"] == size:
            return s["stock"]
    return None


# --- Open access ---
class TestOpenAccess:
    def test_endpoints_work_without_credentials(self):
        assert requests.get(f"{BASE_URL}/api/products").status_code == 200
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        assert response.json()["id"] == "public-access"

    def test_login_endpoint_is_removed(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "x@example.com", "password": "x"})
        assert response.status_code == 404


class TestBackupRestore:
    def test_restore_rejects_invalid_archive(self, admin):
        response = admin.post(
            f"{BASE_URL}/api/dashboard/backups/restore",
            files={"backup_file": ("invalid.zip", b"not a zip archive", "application/zip")},
        )
        assert response.status_code == 400


# --- Users / vendedor RBAC ---
class TestUsers:
    def test_vendor_flow(self, admin):
        email = f"test_vend_{uuid.uuid4().hex[:6]}@lokal.com"
        r = admin.post(f"{BASE_URL}/api/auth/users", json={"email": email, "password": "vend123", "name": "TEST_Vend", "role": "vendedor"})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        CREATED["users"].append(uid)
        dup = admin.post(f"{BASE_URL}/api/auth/users", json={"email": email, "password": "x", "name": "x"})
        assert dup.status_code == 400
        c = requests.post(f"{BASE_URL}/api/auth/users", json={"email": "test_x@x.com", "password": "x", "name": "x"})
        assert c.status_code == 200
        CREATED["users"].append(c.json()["id"])
        d = requests.delete(f"{BASE_URL}/api/auth/users/{uid}")
        assert d.status_code == 200
        # Orders use the shared public-access identity when running without credentials.
        o = requests.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_C", "items": [], "status": "Orçamento"})
        assert o.status_code == 200 and o.json()["vendor_id"] == "public-access"
        CREATED["orders"].append(o.json()["id"])


# --- Products ---
class TestProducts:
    def test_product_list_omits_photos_and_detail_includes_them(self, admin):
        photo = "data:image/png;base64,Zm9v"
        photo_url = "https://images.example.com/product.jpg"
        product = _prod(
            admin,
            "TEST_Produto com foto",
            [{"size": "M", "stock": 1}],
            photo=photo,
            photo_url=photo_url,
        )

        listing = admin.get(f"{BASE_URL}/api/products")
        assert listing.status_code == 200
        listed_product = next(item for item in listing.json() if item["id"] == product["id"])
        assert "photo" not in listed_product
        assert listed_product["photo_url"] == photo_url

        detail = admin.get(f"{BASE_URL}/api/products/{product['id']}")
        assert detail.status_code == 200
        assert detail.json()["photo"] == photo

        image = admin.get(f"{BASE_URL}/api/products/{product['id']}/photo")
        assert image.status_code == 200
        assert image.json()["photo"] == photo

    def test_product_photo_url_must_be_http_or_https(self, admin):
        response = admin.post(
            f"{BASE_URL}/api/products",
            json={
                "name": "TEST_Produto com link inválido",
                "sku": "TEST_" + uuid.uuid4().hex[:6],
                "photo_url": "javascript:alert(1)",
            },
        )
        assert response.status_code == 400

    def test_crud_with_sizes_and_kit(self, admin):
        a = _prod(admin, "TEST_Boina", [{"size": "M", "stock": 3, "stock_min": 1}])
        kit = _prod(admin, "TEST_Kit Conjunto", [{"size": "M", "stock": 1}], is_kit=True,
                    kit_items=[{"product_id": a["id"], "size": "M", "qty": 1}])
        assert kit["is_kit"] and kit["kit_items"][0]["product_id"] == a["id"]
        u = admin.put(f"{BASE_URL}/api/products/{a['id']}", json={"price": 77})
        assert u.status_code == 200 and u.json()["price"] == 77
        # desmontar kit -> child +1
        r = admin.post(f"{BASE_URL}/api/products/{kit['id']}/desmontar_kit", json={"size": "M"})
        assert r.status_code == 200
        assert _stock(admin, a["id"], "M") == 4
        assert _stock(admin, kit["id"], "M") == 0

    def test_manual_montage_consumes_components_and_prevalidates_stock(self, admin):
        trouser = _prod(admin, "TEST_Calca montagem", [{"size": "M", "stock": 2}])
        jacket = _prod(admin, "TEST_Gandola montagem", [{"size": "M", "stock": 3}])
        uniform = _prod(
            admin,
            "TEST_Farda montagem",
            [{"size": "M", "stock": 0}],
            linked_ids=[trouser["id"], jacket["id"]],
        )

        response = admin.post(
            f"{BASE_URL}/api/products/{uniform['id']}/montar",
            json={"size": "M", "qty": 2},
        )
        assert response.status_code == 200, response.text
        assert _stock(admin, uniform["id"], "M") == 2
        assert _stock(admin, trouser["id"], "M") == 0
        assert _stock(admin, jacket["id"], "M") == 1

        movements = admin.get(f"{BASE_URL}/api/stock_movements").json()
        montage_movements = [
            movement for movement in movements
            if movement["product_id"] in {uniform["id"], trouser["id"], jacket["id"]}
            and movement["kind"] in {"MONTAGEM_SAIDA", "MONTAGEM_ENTRADA"}
        ]
        assert len(montage_movements) == 6
        assert sum(movement["kind"] == "MONTAGEM_SAIDA" for movement in montage_movements) == 4
        assert sum(movement["kind"] == "MONTAGEM_ENTRADA" for movement in montage_movements) == 2

        insufficient = admin.post(
            f"{BASE_URL}/api/products/{uniform['id']}/montar",
            json={"size": "M", "qty": 2},
        )
        assert insufficient.status_code == 400
        assert _stock(admin, uniform["id"], "M") == 2
        assert _stock(admin, trouser["id"], "M") == 0
        assert _stock(admin, jacket["id"], "M") == 1


# --- Stock movements ---
class TestStock:
    def test_entrada_saida_avaria(self, admin):
        p = _prod(admin, "TEST_Coturno", [{"size": "40", "stock": 2}])
        r = admin.post(f"{BASE_URL}/api/stock_movements", json={"product_id": p["id"], "product_name": p["name"], "size": "40", "qty": 5, "kind": "ENTRADA", "nf": "TEST_NF1"})
        assert r.status_code == 200
        assert _stock(admin, p["id"], "40") == 7
        admin.post(f"{BASE_URL}/api/stock_movements", json={"product_id": p["id"], "product_name": p["name"], "size": "40", "qty": 2, "kind": "SAIDA"})
        admin.post(f"{BASE_URL}/api/stock_movements", json={"product_id": p["id"], "product_name": p["name"], "size": "40", "qty": 1, "kind": "AVARIA"})
        assert _stock(admin, p["id"], "40") == 4
        hist = admin.get(f"{BASE_URL}/api/stock_movements").json()
        assert len([h for h in hist if h["product_id"] == p["id"]]) >= 3


# --- Orders / commission / desmontagem / trocas ---
class TestOrders:
    def test_separated_status_tracks_when_order_was_separated(self, admin):
        created = admin.post(
            f"{BASE_URL}/api/orders",
            json={"customer_name": "TEST_Separado", "items": [], "status": "Aprovado"},
        )
        assert created.status_code == 200, created.text
        order = created.json()
        CREATED["orders"].append(order["id"])
        assert "separated_at" not in order

        separated = admin.put(
            f"{BASE_URL}/api/orders/{order['id']}",
            json={"status": "Separado"},
        )
        assert separated.status_code == 200, separated.text
        assert separated.json()["separated_at"]

        reopened = admin.put(
            f"{BASE_URL}/api/orders/{order['id']}",
            json={"status": "Aprovado"},
        )
        assert reopened.status_code == 200, reopened.text
        assert reopened.json().get("separated_at") is None

    def test_order_signatures_are_only_returned_by_detail_endpoint(self, admin):
        signature = "data:image/png;base64,Zm9v"
        created = admin.post(
            f"{BASE_URL}/api/orders",
            json={
                "customer_name": "TEST_Assinatura",
                "status": "Orçamento",
                "signature": signature,
                "items": [],
            },
        )
        assert created.status_code == 200, created.text
        order = created.json()
        CREATED["orders"].append(order["id"])

        listing = admin.get(f"{BASE_URL}/api/orders")
        assert listing.status_code == 200
        listed_order = next(item for item in listing.json() if item["id"] == order["id"])
        assert "signature" not in listed_order

        detail = admin.get(f"{BASE_URL}/api/orders/{order['id']}")
        assert detail.status_code == 200
        assert detail.json()["signature"] == signature

    def test_venda_aprovado_stock_and_commission(self, admin):
        p = _prod(admin, "TEST_Cinto", [{"size": "U", "stock": 10}])
        r = admin.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_Cli", "status": "Aprovado", "type": "VENDA",
                                                        "items": [{"product_id": p["id"], "name": p["name"], "size": "U", "qty": 3, "unit_price": 10}]})
        assert r.status_code == 200
        o = r.json(); CREATED["orders"].append(o["id"])
        assert o["total"] == 30 and o["number"] > 0
        assert _stock(admin, p["id"], "U") == 7
        coms = [c for c in admin.get(f"{BASE_URL}/api/commissions").json() if c["order_id"] == o["id"]]
        assert len(coms) == 1 and coms[0]["amount"] == 3

    def test_vendor_signatures_are_only_returned_by_detail_endpoint(self, admin):
        signature = "data:image/png;base64,Zm9v"
        created = admin.post(
            f"{BASE_URL}/api/vendors",
            json={"name": "TEST_Assinatura", "signature": signature},
        )
        assert created.status_code == 200, created.text
        vendor_id = created.json()["id"]
        try:
            listing = admin.get(f"{BASE_URL}/api/vendors")
            assert listing.status_code == 200
            listed_vendor = next(item for item in listing.json() if item["id"] == vendor_id)
            assert "signature" not in listed_vendor

            detail = admin.get(f"{BASE_URL}/api/vendors/{vendor_id}")
            assert detail.status_code == 200
            assert detail.json()["signature"] == signature
        finally:
            admin.delete(f"{BASE_URL}/api/vendors/{vendor_id}")

    def test_orcamento_to_aprovado_once(self, admin):
        p = _prod(admin, "TEST_Mochila", [{"size": "U", "stock": 5}])
        o = admin.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_Cli", "status": "Orçamento",
                                                        "items": [{"product_id": p["id"], "name": p["name"], "size": "U", "qty": 2, "unit_price": 10}]}).json()
        CREATED["orders"].append(o["id"])
        assert _stock(admin, p["id"], "U") == 5
        admin.put(f"{BASE_URL}/api/orders/{o['id']}", json={**o, "status": "Aprovado"})
        admin.put(f"{BASE_URL}/api/orders/{o['id']}", json={**o, "status": "Entregue"})
        assert _stock(admin, p["id"], "U") == 3
        coms = [c for c in admin.get(f"{BASE_URL}/api/commissions").json() if c["order_id"] == o["id"]]
        assert len(coms) == 1 and coms[0]["amount"] == 2

    def test_retirada_lanca_estoque_uma_unica_vez(self, admin):
        p = _prod(admin, "TEST_Bota", [{"size": "42", "stock": 5}])
        o = admin.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_Cli", "status": "Aprovado",
                                                        "items": [{"product_id": p["id"], "name": p["name"], "size": "42", "qty": 2, "unit_price": 10}]}).json()
        CREATED["orders"].append(o["id"])

        response = admin.post(f"{BASE_URL}/api/orders/{o['id']}/fulfill", json={"delivery_type": "RETIRADA"})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "Retirado"
        assert _stock(admin, p["id"], "42") == 3
        movements = [m for m in admin.get(f"{BASE_URL}/api/stock_movements").json() if m.get("order_id") == o["id"]]
        assert len(movements) == 1 and movements[0]["kind"] == "SAIDA"

        repeated = admin.post(f"{BASE_URL}/api/orders/{o['id']}/fulfill", json={"delivery_type": "RETIRADA"})
        assert repeated.status_code == 400
        assert _stock(admin, p["id"], "42") == 3

    def test_entrega_por_transportadora_baixa_estoque_sem_viagem(self, admin):
        p = _prod(admin, "TEST_Casaco", [{"size": "M", "stock": 4}])
        o = admin.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_Cli", "status": "Aprovado",
                                                        "items": [{"product_id": p["id"], "name": p["name"], "size": "M", "qty": 1, "unit_price": 25}]}).json()
        CREATED["orders"].append(o["id"])

        response = admin.post(f"{BASE_URL}/api/orders/{o['id']}/fulfill", json={"delivery_type": "CORREIO"})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "Entregue"
        assert response.json()["delivery_type"] == "CORREIO"
        assert _stock(admin, p["id"], "M") == 3
        trips = [expense for expense in admin.get(f"{BASE_URL}/api/expenses").json() if expense.get("order_id") == o["id"]]
        assert trips == []

    def test_admin_altera_status_e_sincroniza_estoque(self, admin):
        p = _prod(admin, "TEST_Coturno", [{"size": "40", "stock": 5}])
        o = admin.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_Cli", "status": "Aprovado",
                                                        "items": [{"product_id": p["id"], "name": p["name"], "size": "40", "qty": 2, "unit_price": 10}]}).json()
        CREATED["orders"].append(o["id"])

        completed = admin.put(f"{BASE_URL}/api/orders/{o['id']}", json={**o, "status": "Retirado"})
        assert completed.status_code == 200, completed.text
        assert _stock(admin, p["id"], "40") == 3

        reopened = admin.put(f"{BASE_URL}/api/orders/{o['id']}", json={**completed.json(), "status": "Aprovado"})
        assert reopened.status_code == 200, reopened.text
        assert _stock(admin, p["id"], "40") == 5

    def test_desmontagem_farda(self, admin):
        farda = _prod(admin, "TEST_FARDA CAMUFLADA", [{"size": "M", "stock": 1}])
        calca = _prod(admin, "TEST_CALÇA CAMUFLADA", [{"size": "M", "stock": 0}])
        gandola = _prod(admin, "TEST_GANDOLA CAMUFLADA", [{"size": "M", "stock": 0}])
        o = admin.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_Cli", "status": "Aprovado",
                                                        "items": [{"product_id": calca["id"], "name": calca["name"], "size": "M", "qty": 1, "unit_price": 100}]}).json()
        CREATED["orders"].append(o["id"])
        assert _stock(admin, farda["id"], "M") == 0
        assert _stock(admin, calca["id"], "M") == 0
        assert _stock(admin, gandola["id"], "M") == 1
        od = next(x for x in admin.get(f"{BASE_URL}/api/orders").json() if x["id"] == o["id"])
        assert any("FARDA" in l for l in od.get("log", []))

    def test_troca_linked_and_avulsa(self, admin):
        p = _prod(admin, "TEST_Camiseta", [{"size": "G", "stock": 5}, {"size": "M", "stock": 5}])
        v = admin.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_Cli", "status": "Aprovado",
                                                        "items": [{"product_id": p["id"], "name": p["name"], "size": "G", "qty": 1, "unit_price": 50}]}).json()
        CREATED["orders"].append(v["id"])
        assert _stock(admin, p["id"], "G") == 4
        t = admin.post(f"{BASE_URL}/api/orders", json={"type": "TROCA", "status": "Entregue", "customer_name": "TEST_Cli",
                                                        "original_order_id": v["id"],
                                                        "items": [{"product_id": p["id"], "name": p["name"], "size": "M", "qty": 1, "unit_price": 50}],
                                                        "returned_items": [{"product_id": p["id"], "name": p["name"], "size": "G", "qty": 1, "reason": "tamanho"}]}).json()
        CREATED["orders"].append(t["id"])
        assert t["original_order_id"] == v["id"]
        assert _stock(admin, p["id"], "G") == 5
        assert _stock(admin, p["id"], "M") == 4
        d = admin.post(f"{BASE_URL}/api/orders", json={"type": "DEVOLUCAO", "status": "Entregue", "customer_name": "TEST_Cli", "avulsa": True,
                                                        "items": [], "returned_items": [{"product_id": p["id"], "name": p["name"], "size": "M", "qty": 1}]}).json()
        CREATED["orders"].append(d["id"])
        assert d["avulsa"] is True
        assert _stock(admin, p["id"], "M") == 5
        # no commission for troca
        assert not [c for c in admin.get(f"{BASE_URL}/api/commissions").json() if c["order_id"] == t["id"]]


# --- Generic CRUD ---
@pytest.mark.parametrize("coll,payload", [
    ("customers", {"name": "TEST_Loja X", "nome_guerra": "Silva"}),
    ("categories", {"name": "TEST_Cat", "color": "#000000"}),
    ("suppliers", {"name": "TEST_Forn", "cnpj": "00"}),
    ("expenses", {"type": "VIAGEM", "description": "TEST_Viagem", "fuel_cost": 100, "toll_cost": 20, "route": "RJ-SP"}),
    ("expenses", {"type": "MANUTENCAO", "description": "TEST_Oleo", "amount": 50, "plate": "ABC1D23"}),
    ("expenses", {"type": "INSUMO", "description": "TEST_Linha", "amount": 10}),
])
def test_crud(admin, coll, payload):
    r = admin.post(f"{BASE_URL}/api/{coll}", json=payload)
    assert r.status_code == 200, r.text
    i = r.json()["id"]
    g = admin.get(f"{BASE_URL}/api/{coll}/{i}")
    assert g.status_code == 200 and g.json()["description" if coll == "expenses" else "name"].startswith("TEST_")
    u = admin.put(f"{BASE_URL}/api/{coll}/{i}", json={"notes": "upd"} if coll == "suppliers" else {"name": "TEST_upd"} if coll != "expenses" else {"description": "TEST_upd"})
    assert u.status_code == 200
    d = admin.delete(f"{BASE_URL}/api/{coll}/{i}")
    assert d.json()["deleted"] == 1
    assert admin.get(f"{BASE_URL}/api/{coll}/{i}").status_code == 404


# --- Settings & dashboard ---
def test_settings_persist(admin):
    old = admin.get(f"{BASE_URL}/api/settings").json()
    r = admin.put(f"{BASE_URL}/api/settings", json={"background_color": "#E8E4D9"})
    assert r.status_code == 200 and r.json()["background_color"] == "#E8E4D9"
    assert admin.get(f"{BASE_URL}/api/settings").json()["background_color"] == "#E8E4D9"
    admin.put(f"{BASE_URL}/api/settings", json={"background_color": old.get("background_color", "#F5F5F5")})

def test_vehicle_fuels_and_trip_cost_use_settings(admin):
    old_fuel_prices = admin.get(f"{BASE_URL}/api/settings").json().get("fuel_prices", {})
    invalid_price = admin.put(
        f"{BASE_URL}/api/settings",
        json={"fuel_prices": {"Diesel": -1}},
    )
    assert invalid_price.status_code == 400, invalid_price.text
    settings_update = admin.put(
        f"{BASE_URL}/api/settings",
        json={"fuel_prices": {**old_fuel_prices, "Diesel": 6.5}},
    )
    assert settings_update.status_code == 200, settings_update.text

    vehicle_response = admin.post(
        f"{BASE_URL}/api/vehicles",
        json={
            "name": f"TEST_Combustivel_{uuid.uuid4().hex[:6]}",
            "avg_consumption": 12,
            "fuel_types": ["Gasolina", "Diesel"],
        },
    )
    assert vehicle_response.status_code == 200, vehicle_response.text
    vehicle = vehicle_response.json()
    CREATED["vehicles"].append(vehicle["id"])
    assert vehicle["fuel_types"] == ["Gasolina", "Diesel"]

    trip_response = admin.post(
        f"{BASE_URL}/api/expenses",
        json={
            "type": "VIAGEM",
            "description": "TEST_Consumo Diesel",
            "vehicle_id": vehicle["id"],
            "fuel_type": "Diesel",
            "km": 120,
        },
    )
    assert trip_response.status_code == 200, trip_response.text
    trip = trip_response.json()
    CREATED["expenses"].append(trip["id"])
    assert trip["avg_consumption"] == 12
    assert trip["fuel_liters"] == 10
    assert trip["fuel_price_per_liter"] == 6.5
    assert trip["fuel_cost"] == 65

    invalid_fuel = admin.post(
        f"{BASE_URL}/api/expenses",
        json={
            "type": "VIAGEM",
            "description": "TEST_Combustível incompatível",
            "vehicle_id": vehicle["id"],
            "fuel_type": "GNV",
            "km": 10,
        },
    )
    assert invalid_fuel.status_code == 400, invalid_fuel.text
    admin.put(f"{BASE_URL}/api/settings", json={"fuel_prices": old_fuel_prices})

def test_order_number_sequence_is_admin_configurable_without_decreasing(admin):
    sequence = admin.get(f"{BASE_URL}/api/orders/number-sequence")
    assert sequence.status_code == 200, sequence.text
    current_number = sequence.json()["current_number"]
    assert isinstance(current_number, int)

    unchanged = admin.put(
        f"{BASE_URL}/api/orders/number-sequence",
        json={"current_number": current_number},
    )
    assert unchanged.status_code == 200, unchanged.text
    assert unchanged.json()["current_number"] == current_number

    if current_number > 0:
        lower = admin.put(
            f"{BASE_URL}/api/orders/number-sequence",
            json={"current_number": current_number - 1},
        )
        assert lower.status_code == 400

    invalid = admin.put(
        f"{BASE_URL}/api/orders/number-sequence",
        json={"current_number": -1},
    )
    assert invalid.status_code == 422


def test_deleting_latest_order_reuses_its_number(admin):
    current_number = admin.get(f"{BASE_URL}/api/orders/number-sequence").json()["current_number"]

    order = admin.post(
        f"{BASE_URL}/api/orders",
        json={"customer_name": "TEST_Numeração", "items": [], "status": "Orçamento"},
    )
    assert order.status_code == 200, order.text
    CREATED["orders"].append(order.json()["id"])
    order_number = order.json()["number"]
    assert order_number == current_number + 1

    deleted = admin.delete(f"{BASE_URL}/api/orders/{order.json()['id']}")
    assert deleted.status_code == 200, deleted.text
    assert admin.get(f"{BASE_URL}/api/orders/number-sequence").json()["current_number"] == current_number

    replacement = admin.post(
        f"{BASE_URL}/api/orders",
        json={"customer_name": "TEST_Numeração", "items": [], "status": "Orçamento"},
    )
    assert replacement.status_code == 200, replacement.text
    CREATED["orders"].append(replacement.json()["id"])
    assert replacement.json()["number"] == order_number

    deleted_replacement = admin.delete(f"{BASE_URL}/api/orders/{replacement.json()['id']}")
    assert deleted_replacement.status_code == 200, deleted_replacement.text
    assert admin.get(f"{BASE_URL}/api/orders/number-sequence").json()["current_number"] == current_number


def test_dashboard(admin):
    r = admin.get(f"{BASE_URL}/api/dashboard")
    assert r.status_code == 200
    d = r.json()
    for k in ("totals_by_cat", "orders_today", "pending", "chart", "low_stock", "commission_month"):
        assert k in d
    assert "Fardamento" in d["totals_by_cat"] and len(d["chart"]) == 7


def test_day_close_is_saved_and_idempotent(admin):
    product = _prod(admin, "TEST_Fechamento_Estoque", [{"size": "U", "stock": 100}])
    order_response = admin.post(
        f"{BASE_URL}/api/orders",
        json={
            "customer_name": "TEST_Fechamento",
            "items": [{
                "product_id": product["id"],
                "name": product["name"],
                "size": "U",
                "qty": 23,
                "unit_price": 1,
            }],
            "returned_items": [{
                "product_id": product["id"],
                "name": product["name"],
                "size": "U",
                "qty": 5,
                "reason": "TEST_Devolução",
            }],
            "status": "Aprovado",
        },
    )
    assert order_response.status_code == 200, order_response.text
    order = order_response.json()
    CREATED["orders"].append(order["id"])
    fulfilled = admin.post(
        f"{BASE_URL}/api/orders/{order['id']}/fulfill",
        json={"delivery_type": "RETIRADA"},
    )
    assert fulfilled.status_code == 200, fulfilled.text
    assert fulfilled.json()["fulfilled_at"]

    vehicle_response = admin.post(
        f"{BASE_URL}/api/vehicles",
        json={"name": f"TEST_Fechamento_{uuid.uuid4().hex[:6]}", "current_km": 120},
    )
    assert vehicle_response.status_code == 200, vehicle_response.text
    vehicle = vehicle_response.json()
    CREATED["vehicles"].append(vehicle["id"])

    lower_odometer = admin.post(
        f"{BASE_URL}/api/dashboard/close-day",
        json={"vehicle_id": vehicle["id"], "current_km": 119},
    )
    assert lower_odometer.status_code == 400, lower_odometer.text

    first = admin.post(
        f"{BASE_URL}/api/dashboard/close-day",
        json={"vehicle_id": vehicle["id"], "current_km": 157.5},
    )
    assert first.status_code == 200, first.text
    report = first.json()
    assert {"id", "date", "closed_at", "summary", "orders", "stock_movements", "expenses"} <= report.keys()
    assert {"orders_count", "orders_total", "stock_movements_count", "expenses_count", "expenses_total"} <= report["summary"].keys()
    assert report["summary"]["stock_out_quantity"] >= 23
    assert report["summary"]["stock_return_quantity"] >= 5
    assert report["summary"]["stock_reconciliation_count"] == 0
    assert report["stock_reconciliation"] == []
    assert any(item["id"] == order["id"] for item in report["orders"])
    mileage_trip = next(
        expense for expense in report["expenses"]
        if expense.get("description") == "Quilometragem fora das entregas"
        and expense.get("vehicle_id") == vehicle["id"]
    )
    assert mileage_trip["km"] == 37.5
    assert mileage_trip["odometer_km"] == 157.5
    updated_vehicle = next(
        item for item in admin.get(f"{BASE_URL}/api/vehicles").json()
        if item["id"] == vehicle["id"]
    )
    assert updated_vehicle["current_km"] == 157.5
    assert report.get("backup_id")
    backup_response = admin.get(f"{BASE_URL}/api/dashboard/backups/{report['backup_id']}")
    assert backup_response.status_code == 200, backup_response.text
    assert backup_response.content.startswith(b"PK")
    with zipfile.ZipFile(io.BytesIO(backup_response.content)) as backup_archive:
        assert "manifest.json" in backup_archive.namelist()
        assert "data/orders.json" in backup_archive.namelist()

    repeated = admin.post(f"{BASE_URL}/api/dashboard/close-day")
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["id"] == report["id"]
    assert repeated.json()["already_closed"] is True
    history = admin.get(f"{BASE_URL}/api/dashboard/closures")
    assert history.status_code == 200, history.text
    assert any(closure["date"] == report["date"] for closure in history.json())
    saved_report = admin.get(f"{BASE_URL}/api/dashboard/closures/{report['date']}")
    assert saved_report.status_code == 200, saved_report.text
    assert saved_report.json()["id"] == report["id"]
    assert any(item["id"] == order["id"] for item in saved_report.json()["orders"])


def test_auto_endpoint_aliases_vehicle_crud(admin):
    name = f"TEST_Auto_{uuid.uuid4().hex[:6]}"
    created = admin.post(
        f"{BASE_URL}/api/auto",
        json={"name": name, "current_km": 120},
    )
    assert created.status_code == 200, created.text
    vehicle = created.json()
    CREATED["vehicles"].append(vehicle["id"])
    assert any(item["id"] == vehicle["id"] for item in admin.get(f"{BASE_URL}/api/vehicles").json())

    fetched = admin.get(f"{BASE_URL}/api/auto/{vehicle['id']}")
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["name"] == name

    updated = admin.put(
        f"{BASE_URL}/api/auto/{vehicle['id']}",
        json={"current_km": 135},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["current_km"] == 135
    assert admin.get(f"{BASE_URL}/api/vehicles/{vehicle['id']}").json()["current_km"] == 135

    deleted = admin.delete(f"{BASE_URL}/api/auto/{vehicle['id']}")
    assert deleted.status_code == 200, deleted.text
    assert admin.get(f"{BASE_URL}/api/vehicles/{vehicle['id']}").status_code == 404


def test_reset_orders_preserves_settings_and_customers(admin):
    customer_response = admin.post(
        f"{BASE_URL}/api/customers",
        json={"name": f"TEST_Reset_{uuid.uuid4().hex[:6]}"},
    )
    assert customer_response.status_code == 200, customer_response.text
    customer = customer_response.json()
    CREATED["customers"].append(customer["id"])

    first_order = admin.post(
        f"{BASE_URL}/api/orders",
        json={"customer_name": "TEST_Ordem para zerar", "items": []},
    )
    assert first_order.status_code == 200, first_order.text
    CREATED["orders"].append(first_order.json()["id"])

    old_settings = admin.get(f"{BASE_URL}/api/settings").json()
    result = admin.post(f"{BASE_URL}/api/settings/data-reset", json={"groups": ["orders"]})
    assert result.status_code == 200, result.text
    assert result.json()["order_number_reset"] is True
    assert result.json()["preserved"] == ["users", "settings", "backups"]
    assert admin.get(f"{BASE_URL}/api/orders/number-sequence").json()["current_number"] == 0
    assert any(item["id"] == customer["id"] for item in admin.get(f"{BASE_URL}/api/customers").json())
    assert admin.get(f"{BASE_URL}/api/settings").json()["store_name"] == old_settings["store_name"]

    next_order = admin.post(
        f"{BASE_URL}/api/orders",
        json={"customer_name": "TEST_Primeiro após zerar", "items": []},
    )
    assert next_order.status_code == 200, next_order.text
    CREATED["orders"].append(next_order.json()["id"])
    assert next_order.json()["number"] == 1
