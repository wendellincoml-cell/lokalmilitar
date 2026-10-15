# Seed TEST_ data for UI testing (run with arg 'clean' to remove)
import sys, uuid, json, requests
sys.path.insert(0, "/app/backend/tests")
from test_lokal_api import BASE_URL, ADMIN
s = requests.Session()
s.headers["Authorization"] = "Bearer " + s.post(f"{BASE_URL}/api/auth/login", json=ADMIN).json()["access_token"]
if len(sys.argv) > 1 and sys.argv[1] == "clean":
    for o in s.get(f"{BASE_URL}/api/orders").json():
        if (o.get("customer_name") or "").startswith("TEST_"): s.delete(f"{BASE_URL}/api/orders/{o['id']}")
    for p in s.get(f"{BASE_URL}/api/products").json():
        if p["sku"].startswith("TEST_") or p["name"].startswith("TEST_"): s.delete(f"{BASE_URL}/api/products/{p['id']}")
    for c in s.get(f"{BASE_URL}/api/customers").json():
        if c["name"].startswith("TEST_"): s.delete(f"{BASE_URL}/api/customers/{c['id']}")
    for u in s.get(f"{BASE_URL}/api/auth/users").json():
        if u["email"].startswith("test_"): s.delete(f"{BASE_URL}/api/auth/users/{u['id']}")
    print("cleaned"); sys.exit()
cats = {c["name"]: c["id"] for c in s.get(f"{BASE_URL}/api/categories").json()}
p = s.post(f"{BASE_URL}/api/products", json={"name": "TEST_GANDOLA UI", "sku": "TEST_UI1", "price": 150, "category_id": cats.get("Fardamento"),
       "sizes": [{"size": "M", "stock": 5}, {"size": "G", "stock": 5}]}).json()
v = s.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_Cliente UI", "status": "Aprovado", "notes": "TEST obs",
       "items": [{"product_id": p["id"], "name": p["name"], "sku": p["sku"], "size": "M", "qty": 2, "unit_price": 150}],
       "returned_items": [{"product_id": p["id"], "name": p["name"], "size": "G", "qty": 1, "reason": "TEST_tamanho errado"}]}).json()
t = s.post(f"{BASE_URL}/api/orders", json={"type": "TROCA", "status": "Entregue", "customer_name": "TEST_Cliente UI", "original_order_id": v["id"],
       "items": [{"product_id": p["id"], "name": p["name"], "size": "G", "qty": 1, "unit_price": 150}],
       "returned_items": [{"product_id": p["id"], "name": p["name"], "size": "M", "qty": 1, "reason": "TEST_troca linked"}]}).json()
print(json.dumps({"venda": v["number"], "troca": t["number"]}))
