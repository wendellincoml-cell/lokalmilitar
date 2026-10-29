# LOKAL MILITAR - edge cases for FARDA desmontagem with multiple CALÇA/GANDOLA models
import uuid
import requests
from test_lokal_api import BASE_URL

def test_desmontagem_picks_matching_model():
    s = requests.Session()
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
        calca = mk("TEST_CALÇA DIGITAL", 0)
        gandola = mk("TEST_GANDOLA DIGITAL", 0)
        farda = s.post(f"{BASE_URL}/api/products", json={
            "name": "TEST_FARDA (CALÇA + GANDOLA) DIGITAL",
            "sku": "TEST_" + uuid.uuid4().hex[:5],
            "sizes": [{"size": "GG", "stock": 1}],
            "linked_ids": [calca["id"], gandola["id"]],
        }).json()
        ids.append(farda["id"])
        o = s.post(f"{BASE_URL}/api/orders", json={"customer_name": "TEST_E", "status": "Separado",
              "items": [{"product_id": calca["id"], "name": calca["name"], "size": "GG", "qty": 1, "unit_price": 1}]}).json()
        oid = o["id"]
        response = s.put(f"{BASE_URL}/api/orders/{oid}", json={"status": "Entregue"})
        assert response.status_code == 200, response.text
        res = {"farda": st(farda["id"]), "calca_vendida": st(calca["id"]), "gandola": st(gandola["id"]), "outra_calca": st(other_calca["id"])}
        print(res)
        assert res == {"farda": 0, "calca_vendida": 0, "gandola": 1, "outra_calca": 0}, res
        movements = [item for item in s.get(f"{BASE_URL}/api/stock_movements").json() if item.get("order_id") == oid]
        assert {item["kind"] for item in movements} == {"DESMONTAGEM_SAIDA", "DESMONTAGEM_ENTRADA", "SAIDA"}
    finally:
        if oid: s.delete(f"{BASE_URL}/api/orders/{oid}")
        for i in ids: s.delete(f"{BASE_URL}/api/products/{i}")
