# LOKAL MILITAR - edge cases for FARDA desmontagem with multiple CALÇA/GANDOLA models
import uuid
import requests
from test_lokal_api import BASE_URL, ADMIN

def test_desmontagem_picks_matching_model():
    s = requests.Session()
    s.headers["Authorization"] = "Bearer " + s.post(f"{BASE_URL}/api/auth/login", json=ADMIN).json()["access_token"]
    ids = []
    def mk(name, stock):
        r = s.post(f"{BASE_URL}/api/products", json={"name": name, "sku": "TEST_" + uuid.uuid4().hex[:5], "sizes": [{"size": "GG", "stock": stock}]}).json()
        ids.append(r["id"]); return r
    def st(pid):
        p = next(x for x in s.get(f"{BASE_URL}/api/products").json() if x["id"] == pid)
        return p["sizes"][0]["stock"]
    oid = None
    try:
        other_calca = mk("TEST_CALÇA SOCIAL PRETA", 0)
        farda = mk("TEST_FARDA (CALÇA + GANDOLA) DIGITAL", 1)
        calca = mk("TEST_CALÇA DIGITAL", 0)
        gandola = mk("TEST_GANDOLA DIGITAL", 0)
        o = s.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_E", "status": "Aprovado",
              "items": [{"product_id": calca["id"], "name": calca["name"], "size": "GG", "qty": 1, "unit_price": 1}]}).json()
        oid = o["id"]
        res = {"farda": st(farda["id"]), "calca_vendida": st(calca["id"]), "gandola": st(gandola["id"]), "outra_calca": st(other_calca["id"])}
        print(res)
        assert res == {"farda": 0, "calca_vendida": 0, "gandola": 1, "outra_calca": 0}, res
    finally:
        if oid: s.delete(f"{BASE_URL}/api/orders/{oid}")
        for i in ids: s.delete(f"{BASE_URL}/api/products/{i}")
