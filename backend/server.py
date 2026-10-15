from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import jwt
import bcrypt
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"

app = FastAPI(title="LOKAL MILITAR API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# ---------- Helpers ----------
def new_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user

def strip_mongo(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc

# ---------- Models ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "vendedor"  # admin | vendedor

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str

class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    color: str = "#4B5320"
    icon: str = "Package"
    parent_id: Optional[str] = None  # subcategoria
    size_grid: Optional[str] = None  # ROUPA | CALCADOS | NONE
    created_at: str = Field(default_factory=now_iso)

class SizeGrid(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    sizes: List[str] = []
    active: bool = True

class Supplier(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    cnpj: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)

class ProductSize(BaseModel):
    size: str
    stock: float = 0
    stock_min: float = 0

class KitItem(BaseModel):
    product_id: str
    size: Optional[str] = None
    qty: float = 1

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    sku: str
    category_id: Optional[str] = None
    subcategory_id: Optional[str] = None
    color: Optional[str] = None
    brand: Optional[str] = None
    cost: float = 0
    price: float = 0
    shelf: Optional[str] = None
    photo: Optional[str] = None  # base64 or url
    sizes: List[ProductSize] = []
    is_kit: bool = False
    kit_items: List[KitItem] = []
    created_at: str = Field(default_factory=now_iso)

class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str  # Nome / Loja
    nome_guerra: Optional[str] = None
    cpf: Optional[str] = None
    patente_om: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    sizes_fit: Optional[str] = None
    total_spent: float = 0
    created_at: str = Field(default_factory=now_iso)

class OrderItem(BaseModel):
    product_id: str
    sku: Optional[str] = None
    name: str
    size: Optional[str] = None
    qty: float = 1
    unit_price: float = 0
    subtotal: float = 0

class ReturnItem(BaseModel):
    product_id: str
    sku: Optional[str] = None
    name: str
    size: Optional[str] = None
    qty: float = 1
    reason: Optional[str] = None

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    number: int = 0
    type: str = "VENDA"  # VENDA | TROCA | DEVOLUCAO | ORCAMENTO
    status: str = "Orçamento"  # Orçamento | Aprovado | Separado | Entregue | Cancelado
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    items: List[OrderItem] = []
    returned_items: List[ReturnItem] = []  # for exibition on print
    exchanged_items: List[ReturnItem] = []
    original_order_id: Optional[str] = None  # for troca/dev vinculada
    avulsa: bool = False
    discount: float = 0
    total: float = 0
    payment: str = "PIX"
    notes: Optional[str] = None
    expected_date: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    log: List[str] = []  # log de desmontagem etc

class StockMovement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    product_id: str
    product_name: str
    sku: Optional[str] = None
    size: Optional[str] = None
    qty: float = 0
    kind: str = "ENTRADA"  # ENTRADA | SAIDA | AVARIA | DESMONTAGEM | TROCA
    reason: Optional[str] = None
    nf: Optional[str] = None
    order_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)

class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    type: str = "INSUMO"  # INSUMO | VIAGEM | MANUTENCAO
    description: str
    amount: float = 0
    supplier_id: Optional[str] = None
    date: str = Field(default_factory=now_iso)
    # Viagem
    fuel_type: Optional[str] = None
    fuel_cost: float = 0
    toll_cost: float = 0
    avg_consumption: Optional[float] = None
    km: float = 0
    route: Optional[str] = None
    # Manutencao
    plate: Optional[str] = None
    vehicle_model: Optional[str] = None
    next_review_date: Optional[str] = None

class Commission(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    order_id: str
    order_number: int
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    items_count: int = 0
    amount: float = 0
    paid: bool = False
    created_at: str = Field(default_factory=now_iso)

class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "singleton"
    store_name: str = "LOKAL MILITAR"
    store_subtitle: str = "Fardas e Artigos Militares"
    store_full_name: str = "Lokal Comercio de Artigos do Vestuario LTDA"
    cnpj: str = "27.863.152/0001-74"
    phone: str = "(21) 00000-0000"
    instagram: str = "@lokalmilitar"
    address: str = "Rua Salustiano Silva, Nº 550, H - 21745590 - Rio de Janeiro, RJ"
    pix_key: str = ""
    background_color: str = "#F5F5F5"
    print_header_html: str = ""
    print_footer_text: str = "Obrigado pela preferência! - Lokal Militar"

# ---------- Simple generic CRUD factory ----------
def make_crud(coll_name: str, Model):
    router = APIRouter(prefix=f"/{coll_name}")

    @router.get("")
    async def list_all(user: dict = Depends(get_current_user)):
        docs = await db[coll_name].find({}, {"_id": 0}).to_list(5000)
        return docs

    @router.post("")
    async def create(payload: dict, user: dict = Depends(get_current_user)):
        obj = Model(**payload)
        doc = obj.model_dump()
        await db[coll_name].insert_one(doc)
        return strip_mongo(doc)

    @router.get("/{item_id}")
    async def get_one(item_id: str, user: dict = Depends(get_current_user)):
        doc = await db[coll_name].find_one({"id": item_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        return doc

    @router.put("/{item_id}")
    async def update(item_id: str, payload: dict, user: dict = Depends(get_current_user)):
        payload.pop("id", None)
        res = await db[coll_name].update_one({"id": item_id}, {"$set": payload})
        if res.matched_count == 0:
            raise HTTPException(404, "Not found")
        doc = await db[coll_name].find_one({"id": item_id}, {"_id": 0})
        return doc

    @router.delete("/{item_id}")
    async def delete(item_id: str, user: dict = Depends(get_current_user)):
        res = await db[coll_name].delete_one({"id": item_id})
        return {"deleted": res.deleted_count}

    return router

# ---------- Auth routes ----------
@api.post("/auth/login")
async def login(payload: LoginIn):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_pw(payload.password, user.get("password_hash", "")):
        raise HTTPException(401, "Credenciais inválidas")
    token = create_token(user["id"], user["email"], user.get("role", "vendedor"))
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"access_token": token, "token_type": "bearer", "user": user}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.get("/auth/users")
async def list_users(user: dict = Depends(get_current_user)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return docs

@api.post("/auth/users")
async def create_user(payload: UserCreate, user: dict = Depends(require_admin)):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(400, "Email já cadastrado")
    doc = {
        "id": new_id(),
        "email": payload.email.lower(),
        "name": payload.name,
        "role": payload.role,
        "password_hash": hash_pw(payload.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

@api.put("/auth/users/{uid}")
async def update_user(uid: str, payload: dict, user: dict = Depends(require_admin)):
    upd = {k: v for k, v in payload.items() if k in ("name", "role", "email")}
    if payload.get("password"):
        upd["password_hash"] = hash_pw(payload["password"])
    await db.users.update_one({"id": uid}, {"$set": upd})
    doc = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return doc

@api.delete("/auth/users/{uid}")
async def delete_user(uid: str, user: dict = Depends(require_admin)):
    if uid == user["id"]:
        raise HTTPException(400, "Não pode se auto-excluir")
    await db.users.delete_one({"id": uid})
    return {"deleted": 1}

# ---------- Mount generic CRUDs ----------
api.include_router(make_crud("categories", Category))
api.include_router(make_crud("size_grids", SizeGrid))
api.include_router(make_crud("suppliers", Supplier))
api.include_router(make_crud("customers", Customer))
api.include_router(make_crud("expenses", Expense))

# ---------- Products (custom to validate kit) ----------
@api.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    return await db.products.find({}, {"_id": 0}).to_list(5000)

@api.post("/products")
async def create_product(payload: dict, user: dict = Depends(get_current_user)):
    obj = Product(**payload)
    doc = obj.model_dump()
    await db.products.insert_one(doc)
    return strip_mongo(doc)

@api.put("/products/{pid}")
async def update_product(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.products.update_one({"id": pid}, {"$set": payload})
    return await db.products.find_one({"id": pid}, {"_id": 0})

@api.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(get_current_user)):
    await db.products.delete_one({"id": pid})
    return {"deleted": 1}

async def _change_stock(product_id: str, size: Optional[str], delta: float):
    """Adjust product size stock by delta (positive=add, negative=subtract)."""
    p = await db.products.find_one({"id": product_id})
    if not p:
        return False
    sizes = p.get("sizes", [])
    found = False
    for s in sizes:
        if s.get("size") == size:
            s["stock"] = float(s.get("stock", 0)) + delta
            found = True
            break
    if not found:
        sizes.append({"size": size or "-", "stock": delta, "stock_min": 0})
    await db.products.update_one({"id": product_id}, {"$set": {"sizes": sizes}})
    return True

async def _stock_of(product_id: str, size: Optional[str]) -> float:
    p = await db.products.find_one({"id": product_id})
    if not p:
        return 0
    for s in p.get("sizes", []):
        if s.get("size") == size:
            return float(s.get("stock", 0))
    return 0

async def _find_product_by_name_contains(terms: List[str], size: str):
    """Find a product whose name matches ALL terms (case-insensitive) with given size in stock>0."""
    docs = await db.products.find({}, {"_id": 0}).to_list(5000)
    for d in docs:
        name_u = (d.get("name") or "").upper()
        if all(t in name_u for t in terms):
            for s in d.get("sizes", []):
                if s.get("size") == size and float(s.get("stock", 0)) > 0:
                    return d
    return None

async def _try_desmontar_farda(need_name_hint: str, size: str, order_log: List[str]) -> bool:
    """If a CALCA or GANDOLA of given size is missing, look for a FARDA of same size and disassemble."""
    farda = await _find_product_by_name_contains(["FARDA"], size)
    if not farda:
        return False
    # subtract 1 FARDA size
    await _change_stock(farda["id"], size, -1)
    await db.stock_movements.insert_one({
        "id": new_id(), "product_id": farda["id"], "product_name": farda["name"],
        "sku": farda.get("sku"), "size": size, "qty": 1,
        "kind": "DESMONTAGEM", "reason": f"Desmontagem automática para atender pedido ({need_name_hint})",
        "created_at": now_iso()
    })
    order_log.append(f"FARDA-{size} desmontada para atender o pedido")
    # add 1 CALCA and 1 GANDOLA of same size
    calca = None
    gandola = None
    docs = await db.products.find({}, {"_id": 0}).to_list(5000)
    for d in docs:
        n = (d.get("name") or "").upper()
        if "CALCA" in n or "CALÇA" in n:
            calca = calca or d
        if "GANDOLA" in n:
            gandola = gandola or d
    if calca:
        await _change_stock(calca["id"], size, 1)
    if gandola:
        await _change_stock(gandola["id"], size, 1)
    return True

# ---------- Stock movements ----------
@api.get("/stock_movements")
async def list_stock(user: dict = Depends(get_current_user)):
    return await db.stock_movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)

@api.post("/stock_movements")
async def create_stock(payload: dict, user: dict = Depends(get_current_user)):
    obj = StockMovement(**payload)
    doc = obj.model_dump()
    await db.stock_movements.insert_one(doc)
    delta = doc["qty"] if doc["kind"] in ("ENTRADA", "DESMONTAGEM_INV") else -abs(doc["qty"])
    if doc["kind"] == "ENTRADA":
        delta = abs(doc["qty"])
    elif doc["kind"] in ("SAIDA", "AVARIA"):
        delta = -abs(doc["qty"])
    await _change_stock(doc["product_id"], doc.get("size"), delta)
    return strip_mongo(doc)

@api.delete("/stock_movements/{mid}")
async def del_stock(mid: str, user: dict = Depends(get_current_user)):
    await db.stock_movements.delete_one({"id": mid})
    return {"deleted": 1}

@api.post("/products/{pid}/desmontar_kit")
async def desmontar_kit(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    """Pega 1 unidade do kit (pelo size) e devolve ao estoque os itens individuais."""
    size = payload.get("size")
    p = await db.products.find_one({"id": pid})
    if not p or not p.get("is_kit"):
        raise HTTPException(400, "Produto não é um kit")
    stock = await _stock_of(pid, size)
    if stock <= 0:
        raise HTTPException(400, "Sem estoque do kit")
    await _change_stock(pid, size, -1)
    for item in p.get("kit_items", []):
        await _change_stock(item["product_id"], item.get("size") or size, item.get("qty", 1))
        child = await db.products.find_one({"id": item["product_id"]})
        await db.stock_movements.insert_one({
            "id": new_id(), "product_id": item["product_id"],
            "product_name": (child or {}).get("name", ""),
            "sku": (child or {}).get("sku"),
            "size": item.get("size") or size, "qty": item.get("qty", 1),
            "kind": "DESMONTAGEM", "reason": f"Desmontagem manual do kit {p.get('name')}",
            "created_at": now_iso()
        })
    await db.stock_movements.insert_one({
        "id": new_id(), "product_id": pid, "product_name": p.get("name", ""),
        "sku": p.get("sku"), "size": size, "qty": 1,
        "kind": "DESMONTAGEM", "reason": "Kit desmontado",
        "created_at": now_iso()
    })
    return {"ok": True}

# ---------- Orders ----------
async def _next_order_number() -> int:
    counter = await db.counters.find_one_and_update(
        {"_id": "orders"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    if not counter:
        return 1
    return int(counter.get("seq") or 1)

async def _apply_order_stock(order: dict):
    """Decrement stock for VENDA/TROCA out items; add for DEVOLUCAO/returned items."""
    log = order.get("log", [])
    for it in order.get("items", []):
        pid = it["product_id"]
        size = it.get("size")
        qty = float(it.get("qty", 1))
        prod = await db.products.find_one({"id": pid})
        if not prod:
            continue
        # If product is kit, disassemble into items
        if prod.get("is_kit"):
            for kit_it in prod.get("kit_items", []):
                csize = kit_it.get("size") or size
                cqty = float(kit_it.get("qty", 1)) * qty
                child = await db.products.find_one({"id": kit_it["product_id"]})
                if not child:
                    continue
                cur = await _stock_of(child["id"], csize)
                if cur < cqty:
                    # try FARDA desmontagem for CALCA/GANDOLA
                    name_u = (child.get("name") or "").upper()
                    if "CALCA" in name_u or "CALÇA" in name_u or "GANDOLA" in name_u:
                        await _try_desmontar_farda(child.get("name"), csize, log)
                await _change_stock(child["id"], csize, -cqty)
                await db.stock_movements.insert_one({
                    "id": new_id(), "product_id": child["id"],
                    "product_name": child.get("name"), "sku": child.get("sku"),
                    "size": csize, "qty": cqty, "kind": "SAIDA",
                    "reason": f"Venda kit pedido #{order.get('number')}",
                    "order_id": order["id"], "created_at": now_iso()
                })
        else:
            cur = await _stock_of(pid, size)
            if cur < qty:
                name_u = (prod.get("name") or "").upper()
                if "CALCA" in name_u or "CALÇA" in name_u or "GANDOLA" in name_u:
                    await _try_desmontar_farda(prod.get("name"), size, log)
            await _change_stock(pid, size, -qty)
            await db.stock_movements.insert_one({
                "id": new_id(), "product_id": pid, "product_name": prod.get("name"),
                "sku": prod.get("sku"), "size": size, "qty": qty, "kind": "SAIDA",
                "reason": f"Venda pedido #{order.get('number')}",
                "order_id": order["id"], "created_at": now_iso()
            })
    # Devoluções: adicionar ao estoque
    for ri in order.get("returned_items", []):
        pid = ri["product_id"]
        size = ri.get("size")
        qty = float(ri.get("qty", 1))
        prod = await db.products.find_one({"id": pid})
        await _change_stock(pid, size, qty)
        await db.stock_movements.insert_one({
            "id": new_id(), "product_id": pid,
            "product_name": (prod or {}).get("name"), "sku": (prod or {}).get("sku"),
            "size": size, "qty": qty, "kind": "ENTRADA",
            "reason": f"Devolução pedido #{order.get('number')} - {ri.get('reason') or ''}",
            "order_id": order["id"], "created_at": now_iso()
        })
    if log:
        await db.orders.update_one({"id": order["id"]}, {"$set": {"log": log}})

@api.get("/orders")
async def list_orders(user: dict = Depends(get_current_user)):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)

@api.post("/orders")
async def create_order(payload: dict, user: dict = Depends(get_current_user)):
    payload["number"] = await _next_order_number()
    if not payload.get("vendor_id"):
        payload["vendor_id"] = user["id"]
        payload["vendor_name"] = user.get("name")
    # compute totals
    items = payload.get("items", [])
    subtotal = sum(float(it.get("qty", 1)) * float(it.get("unit_price", 0)) for it in items)
    for it in items:
        it["subtotal"] = float(it.get("qty", 1)) * float(it.get("unit_price", 0))
    discount = float(payload.get("discount", 0))
    payload["total"] = max(0, subtotal - discount)
    obj = Order(**payload)
    doc = obj.model_dump()
    await db.orders.insert_one(doc)
    # Stock & commission on APROVADO/ENTREGUE
    if doc["status"] in ("Aprovado", "Entregue") and doc["type"] in ("VENDA",):
        await _apply_order_stock(doc)
        await _record_commission(doc)
    if doc["type"] in ("TROCA", "DEVOLUCAO"):
        await _apply_order_stock(doc)
    return strip_mongo(doc)

@api.put("/orders/{oid}")
async def update_order(oid: str, payload: dict, user: dict = Depends(get_current_user)):
    old = await db.orders.find_one({"id": oid})
    if not old:
        raise HTTPException(404, "Pedido não encontrado")
    payload.pop("id", None)
    payload.pop("number", None)
    items = payload.get("items", old.get("items", []))
    subtotal = sum(float(it.get("qty", 1)) * float(it.get("unit_price", 0)) for it in items)
    for it in items:
        it["subtotal"] = float(it.get("qty", 1)) * float(it.get("unit_price", 0))
    payload["items"] = items
    discount = float(payload.get("discount", old.get("discount", 0)))
    payload["total"] = max(0, subtotal - discount)
    await db.orders.update_one({"id": oid}, {"$set": payload})
    doc = await db.orders.find_one({"id": oid}, {"_id": 0})
    # Status transition to Aprovado/Entregue → trigger stock + commission once
    was_active = old.get("status") in ("Aprovado", "Entregue")
    now_active = doc.get("status") in ("Aprovado", "Entregue")
    if (not was_active) and now_active and doc.get("type") == "VENDA":
        await _apply_order_stock(doc)
        await _record_commission(doc)
    return doc

@api.delete("/orders/{oid}")
async def delete_order(oid: str, user: dict = Depends(get_current_user)):
    await db.orders.delete_one({"id": oid})
    await db.commissions.delete_many({"order_id": oid})
    return {"deleted": 1}

# ---------- Commissions ----------
async def _record_commission(order: dict):
    exists = await db.commissions.find_one({"order_id": order["id"]})
    if exists:
        return
    items_count = int(sum(float(it.get("qty", 1)) for it in order.get("items", [])))
    com = {
        "id": new_id(),
        "order_id": order["id"],
        "order_number": order.get("number", 0),
        "vendor_id": order.get("vendor_id"),
        "vendor_name": order.get("vendor_name"),
        "items_count": items_count,
        "amount": float(items_count),
        "paid": False,
        "created_at": now_iso(),
    }
    await db.commissions.insert_one(com)

@api.get("/commissions")
async def list_commissions(user: dict = Depends(get_current_user)):
    return await db.commissions.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)

@api.put("/commissions/{cid}")
async def update_commission(cid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.commissions.update_one({"id": cid}, {"$set": payload})
    return await db.commissions.find_one({"id": cid}, {"_id": 0})

@api.post("/commissions/mark_paid")
async def mark_paid(payload: dict, user: dict = Depends(get_current_user)):
    ids = payload.get("ids", [])
    await db.commissions.update_many({"id": {"$in": ids}}, {"$set": {"paid": True}})
    return {"ok": True}

# ---------- Settings ----------
@api.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"id": "singleton"}, {"_id": 0})
    if not doc:
        s = Settings().model_dump()
        await db.settings.insert_one(s)
        return strip_mongo(s)
    return doc

@api.put("/settings")
async def update_settings(payload: dict, user: dict = Depends(get_current_user)):
    payload["id"] = "singleton"
    await db.settings.update_one({"id": "singleton"}, {"$set": payload}, upsert=True)
    return await db.settings.find_one({"id": "singleton"}, {"_id": 0})

# ---------- Dashboard summary ----------
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(5000)
    categories = await db.categories.find({}, {"_id": 0}).to_list(500)
    cat_map = {c["id"]: c for c in categories}
    totals_by_cat = {c["name"]: {"qty": 0, "value": 0, "color": c.get("color", "#4B5320")}
                     for c in categories if not c.get("parent_id")}
    low_stock = []
    for p in products:
        total_qty = sum(float(s.get("stock", 0)) for s in p.get("sizes", []))
        total_val = total_qty * float(p.get("price", 0))
        cid = p.get("category_id")
        cname = (cat_map.get(cid) or {}).get("name", "Sem Categoria")
        totals_by_cat.setdefault(cname, {"qty": 0, "value": 0, "color": (cat_map.get(cid) or {}).get("color", "#4B5320")})
        totals_by_cat[cname]["qty"] += total_qty
        totals_by_cat[cname]["value"] += total_val
        for s in p.get("sizes", []):
            if float(s.get("stock", 0)) <= float(s.get("stock_min", 0)) and float(s.get("stock_min", 0)) > 0:
                low_stock.append({"id": p["id"], "name": p["name"], "sku": p.get("sku"),
                                  "size": s["size"], "stock": s["stock"], "stock_min": s["stock_min"]})
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    orders_today = [o for o in orders if (o.get("created_at", "") or "").startswith(today)]
    pending = [o for o in orders if o.get("status") in ("Orçamento", "Aprovado", "Separado")]
    customers = await db.customers.count_documents({})
    # commission month
    cur_month = datetime.now(timezone.utc).strftime("%Y-%m")
    coms = await db.commissions.find({}, {"_id": 0}).to_list(5000)
    com_month = sum(c.get("amount", 0) for c in coms if (c.get("created_at", "") or "").startswith(cur_month))
    # expenses month
    exps = await db.expenses.find({}, {"_id": 0}).to_list(5000)
    exp_month = sum(e.get("amount", 0) + e.get("fuel_cost", 0) + e.get("toll_cost", 0)
                    for e in exps if (e.get("date", "") or "").startswith(cur_month))
    # sales chart last 7 days
    chart = []
    for i in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        total_day = sum(o.get("total", 0) for o in orders
                        if (o.get("created_at", "") or "").startswith(day)
                        and o.get("status") in ("Aprovado", "Entregue")
                        and o.get("type") == "VENDA")
        chart.append({"date": day, "value": total_day})
    return {
        "totals_by_cat": totals_by_cat,
        "orders_today": len(orders_today),
        "pending": len(pending),
        "customers": customers,
        "commission_month": com_month,
        "expenses_month": exp_month,
        "low_stock": low_stock,
        "chart": chart,
    }

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lokal")

@app.on_event("startup")
async def startup():
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@lokalmilitar.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "lokal123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "name": "Administrador",
            "role": "admin",
            "password_hash": hash_pw(admin_password),
            "created_at": now_iso(),
        })
    # Seed size grids
    if await db.size_grids.count_documents({}) == 0:
        await db.size_grids.insert_many([
            {"id": new_id(), "name": "ROUPA", "sizes": ["PP","P","M","G","GG","XG","XGG"], "active": True},
            {"id": new_id(), "name": "CALCADOS", "sizes": [str(n) for n in range(34, 48)], "active": True},
        ])
    # Seed categories
    if await db.categories.count_documents({}) == 0:
        base = [
            ("Fardamento", "#4B5320", "Shirt", "ROUPA"),
            ("Calçados", "#111111", "Footprints", "CALCADOS"),
            ("Acessórios", "#C3B091", "Package", None),
            ("Insígnias", "#B8860B", "Star", None),
            ("Brevês", "#B8860B", "Award", None),
            ("Tático", "#4B5320", "Shield", None),
        ]
        for n, c, i, g in base:
            await db.categories.insert_one({"id": new_id(), "name": n, "color": c, "icon": i,
                                            "parent_id": None, "size_grid": g, "created_at": now_iso()})
    # Seed settings
    if not await db.settings.find_one({"id": "singleton"}):
        await db.settings.insert_one(Settings().model_dump())
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.products.create_index("sku")
    await db.orders.create_index("number")
    logger.info("LOKAL MILITAR API started.")

@app.on_event("shutdown")
async def shutdown():
    client.close()
