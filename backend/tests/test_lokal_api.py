# LOKAL MILITAR ERP - backend regression tests (auth, users, products, stock, orders, desmontagem, trocas, commissions, crud, settings)
import os
import uuid
import pytest
import requests

def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
    return url.rstrip("/")

BASE_URL = _base()
ADMIN = {"email": "admin@lokalmilitar.com", "password": "lokal123"}
CREATED = {"products": [], "orders": [], "users": [], "customers": [], "suppliers": [], "categories": [], "expenses": []}


@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip("admin login failed")
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
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


# --- Auth ---
class TestAuth:
    def test_login_ok(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
        assert r.status_code == 200
        d = r.json()
        assert d["access_token"] and d["user"]["role"] == "admin"
        assert "password_hash" not in d["user"]

    def test_login_bad(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN["email"], "password": "x"})
        assert r.status_code == 401

    def test_no_token(self):
        assert requests.get(f"{BASE_URL}/api/products").status_code == 401
        assert requests.get(f"{BASE_URL}/api/auth/me").status_code == 401

    def test_me(self, admin):
        r = admin.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200 and r.json()["email"] == ADMIN["email"]


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
        lr = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "vend123"})
        assert lr.status_code == 200 and lr.json()["user"]["role"] == "vendedor"
        vh = {"Authorization": f"Bearer {lr.json()['access_token']}"}
        c = requests.post(f"{BASE_URL}/api/auth/users", headers=vh, json={"email": "test_x@x.com", "password": "x", "name": "x"})
        assert c.status_code == 403
        d = requests.delete(f"{BASE_URL}/api/auth/users/{uid}", headers=vh)
        assert d.status_code == 403
        # vendor order -> vendor_name assigned
        o = requests.post(f"{BASE_URL}/api/orders", headers=vh, json={"customer_name": "TEST_C", "items": [], "status": "Orçamento"})
        assert o.status_code == 200 and o.json()["vendor_id"] == uid
        CREATED["orders"].append(o.json()["id"])


# --- Products ---
class TestProducts:
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


def test_dashboard(admin):
    r = admin.get(f"{BASE_URL}/api/dashboard")
    assert r.status_code == 200
    d = r.json()
    for k in ("totals_by_cat", "orders_today", "pending", "chart", "low_stock", "commission_month"):
        assert k in d
    assert "Fardamento" in d["totals_by_cat"] and len(d["chart"]) == 7
