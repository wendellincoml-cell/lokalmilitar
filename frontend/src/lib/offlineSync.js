import axios from "axios";
import { API } from "@/lib/api";

const DATABASE_NAME = "lokal-militar-offline";
const DATABASE_VERSION = 2;
const CACHE_STORE = "api-cache";
const QUEUE_STORE = "write-queue";
const QUEUE_EVENT = "lokal-offline-queue-change";
const EXCLUDED_PATHS = ["/api/auth/"];
const inFlightSyncs = new Set();

let databasePromise;
let activeUserId = null;

const isExcludedPath = (pathname) =>
  EXCLUDED_PATHS.some((path) => pathname.startsWith(path)) ||
  pathname === "/api/dashboard/close-day";

const createId = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 | 0;
    return (character === "x" ? random : (random & 0x3 | 0x8)).toString(16);
  });
};

const openDatabase = () => {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("O armazenamento offline não está disponível neste navegador."));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        const transaction = request.transaction;
        const cache = database.objectStoreNames.contains(CACHE_STORE)
          ? transaction.objectStore(CACHE_STORE)
          : database.createObjectStore(CACHE_STORE, { keyPath: "key" });
        if (!cache.indexNames.contains("ownerId")) cache.createIndex("ownerId", "ownerId");
        const queue = database.objectStoreNames.contains(QUEUE_STORE)
          ? transaction.objectStore(QUEUE_STORE)
          : database.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        if (!queue.indexNames.contains("ownerId")) queue.createIndex("ownerId", "ownerId");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento offline."));
      request.onblocked = () => reject(new Error("Feche outras abas do app para habilitar o armazenamento offline."));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
};

const storeRequest = async (storeName, mode, action) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error("Falha ao acessar os dados offline."));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("Falha ao gravar dados offline."));
    transaction.onabort = () => reject(transaction.error || new Error("A gravação offline foi cancelada."));
  });
};

const storeQueueEntry = async (entry) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(QUEUE_STORE);
    const request = store.index("ownerId").getAll(entry.ownerId);
    request.onsuccess = () => {
      const previousSequence = request.result.reduce(
        (highest, item) => Math.max(highest, Number(item.sequence || 0)),
        0,
      );
      entry.sequence = previousSequence + 1;
      store.put(entry);
    };
    request.onerror = () => reject(request.error || new Error("Não foi possível ordenar a fila offline."));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Não foi possível guardar a alteração offline."));
    transaction.onabort = () => reject(transaction.error || new Error("A gravação da fila offline foi cancelada."));
  });
};

const apiURL = (url, baseURL = API) => {
  if (/^https?:\/\//i.test(url)) return new URL(url).href;
  const base = new URL(baseURL, window.location.origin);
  const [pathname, search = ""] = url.split("?");
  const combinedPath = `${base.pathname.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
  return new URL(`${combinedPath}${search ? `?${search}` : ""}`, base.origin).href;
};
const cacheKey = (ownerId, url) => `${ownerId}:${apiURL(url)}`;
const apiPath = (url) => new URL(apiURL(url)).pathname;
const routePath = (url) => apiPath(url).replace(/^\/api(?=\/|$)/, "") || "/";

const notifyQueueChange = () => {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
};

export const offlineQueueEvent = QUEUE_EVENT;

export const setOfflineUser = (userId) => {
  activeUserId = userId || null;
  if (activeUserId) {
    window.addEventListener("online", syncOfflineQueue);
    if (navigator.onLine) syncOfflineQueue();
  } else {
    window.removeEventListener("online", syncOfflineQueue);
  }
};

export const getActiveOfflineUser = () => activeUserId;

export const saveApiResponse = async (url, data) => {
  if (!activeUserId || isExcludedPath(apiPath(url))) return;
  await storeRequest(CACHE_STORE, "readwrite", (store) =>
    store.put({ key: cacheKey(activeUserId, url), ownerId: activeUserId, data }),
  );
};

export const readCachedApiResponse = async (url) => {
  if (!activeUserId || isExcludedPath(apiPath(url))) return null;
  const cached = await storeRequest(CACHE_STORE, "readonly", (store) =>
    store.get(cacheKey(activeUserId, url)),
  );
  return cached?.data ?? null;
};

export const updateOfflineCacheForMutation = async (config, responseData, ownerId = activeUserId) => {
  if (!ownerId || isExcludedPath(apiPath(config.url, config.baseURL))) return;
  const data = config.data && typeof config.data === "string"
    ? (() => { try { return JSON.parse(config.data); } catch { return config.data; } })()
    : config.data;
  const entry = {
    method: (config.method || "post").toUpperCase(),
    url: config.url,
    data,
  };
  entry.conflictTarget = await resolveConflictTarget(entry, ownerId);
  if (entry.method === "DELETE") {
    entry.sourceRecord = await getBaseline({ ...entry, conflictTarget: getTarget(entry) }, ownerId);
  }
  await updateCachedCollections({
    ...entry,
  }, responseData, ownerId);
};

const cacheRecords = async (ownerId, endpoint) => {
  const cached = await storeRequest(CACHE_STORE, "readonly", (store) =>
    store.index("ownerId").getAll(ownerId),
  );
  const expectedPath = apiPath(endpoint);
  return cached.filter((entry) => {
    const url = new URL(entry.key.slice(ownerId.length + 1));
    return url.pathname === expectedPath && !url.search;
  });
};

const putCachedRecords = async (ownerId, entries, dataByKey) => {
  if (!entries.length) return;
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readwrite");
  const store = transaction.objectStore(CACHE_STORE);
  entries.forEach((entry) => store.put({ ...entry, data: dataByKey(entry) }));
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Falha ao atualizar o cache offline."));
    transaction.onabort = () => reject(transaction.error || new Error("A atualização do cache offline foi cancelada."));
  });
};

const getTarget = (entry) => {
  const segments = routePath(entry.url).split("/").filter(Boolean);
  const collection = segments[0];
  if (!collection) return null;
  if (collection === "settings") return { collection, id: "singleton" };
  if (collection === "orders" && segments[1] === "number-sequence") {
    return { collection, id: "number-sequence", action: "number-sequence" };
  }
  if (segments.length === 1) return { collection, id: entry.data?.id || null };
  if (segments[1] === "mark_paid") return { collection, id: null, action: "mark_paid" };
  return { collection, id: segments[1], action: segments[2] || null };
};

const getConflictTarget = (entry) => {
  const target = getTarget(entry);
  const segments = routePath(entry.url).split("/").filter(Boolean);
  if (segments[0] === "stock_movements" && entry.method === "POST" && entry.data?.product_id) {
    return { collection: "products", id: entry.data.product_id };
  }
  return target;
};

const resolveConflictTarget = async (entry, ownerId) => {
  const target = getConflictTarget(entry);
  const segments = routePath(entry.url).split("/").filter(Boolean);
  if (segments[0] === "stock_movements" && entry.method === "DELETE" && segments[1]) {
    const cached = await cacheRecords(ownerId, "/stock_movements");
    const movement = cached
      .flatMap((item) => Array.isArray(item.data) ? item.data : [])
      .find((item) => item.id === segments[1]);
    if (movement?.product_id) return { collection: "products", id: movement.product_id };
  }
  return target;
};

const adjustProductStock = (products, productId, size, delta) => {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  const matchingSize = (product.sizes || []).find((item) => item.size === size);
  if (matchingSize) matchingSize.stock = Number(matchingSize.stock || 0) + delta;
  else product.sizes = [...(product.sizes || []), { size: size || "-", stock: delta, stock_min: 0 }];
};

const movementStockDelta = (movement) =>
  (movement?.kind === "ENTRADA" ? 1 : -1) * Math.abs(Number(movement?.qty || 0));

const updateCachedCollections = async (entry, responseData, ownerId) => {
  const target = getTarget(entry);
  if (!target) return;
  if (target.action === "number-sequence" && entry.method.toUpperCase() === "PUT") {
    await storeRequest(CACHE_STORE, "readwrite", (store) =>
      store.put({
        key: cacheKey(ownerId, entry.url),
        ownerId,
        data: responseData,
      }),
    );
    return;
  }
  const collectionPath = `/${target.collection}`;
  const collections = await cacheRecords(ownerId, collectionPath);
  if (!collections.length) return;

  const route = routePath(entry.url);
  const method = entry.method.toUpperCase();
  const responseRecord = responseData && typeof responseData === "object" ? responseData : null;
  const recordId = target.id || responseRecord?.id;

  await putCachedRecords(ownerId, collections, (cached) => {
    if (!Array.isArray(cached.data)) {
      if (method === "PUT" && route === collectionPath && responseRecord) return responseRecord;
      return cached.data;
    }
    let records = cached.data.map((record) => ({ ...record }));

    if (route === collectionPath && method === "POST" && responseRecord) {
      const localRecord = entry.queuedOffline
        ? { ...responseRecord, _offline_pending: true }
        : responseRecord;
      records = records.filter((record) => record.id !== responseRecord.id);
      records.unshift(localRecord);
      return records;
    }
    if (target.action === "mark_paid" && method === "POST") {
      const ids = new Set(entry.data?.ids || []);
      return records.map((record) => ids.has(record.id) ? { ...record, paid: true } : record);
    }
    if (target.action === "consume" && method === "POST") {
      return records.map((record) => record.id === recordId
        ? { ...record, remaining_quantity: Math.max(Number(record.remaining_quantity || 0) - Number(entry.data?.quantity || 0), 0) }
        : record);
    }
    if (target.action === "fulfill" && method === "POST") {
      return records.map((record) => record.id === recordId
        ? {
          ...record,
          status: entry.data?.delivery_type === "RETIRADA" ? "Retirado" : "Entregue",
          delivery_type: entry.data?.delivery_type,
          ...(entry.data?.vehicle_id ? { vehicle_id: entry.data.vehicle_id } : {}),
          ...(entry.data?.signature ? { signature: entry.data.signature } : {}),
          _offline_pending: true,
        }
        : record);
    }
    if (target.action === "desmontar" && method === "POST") {
      return records.map((record) => {
        if (record.id !== recordId) return record;
        const quantity = Number(entry.data?.qty || 0);
        const sizes = (record.sizes || []).map((item) => ({ ...item }));
        const selected = sizes.find((item) => item.size === entry.data?.size);
        if (selected) selected.stock = Number(selected.stock || 0) - quantity;
        return { ...record, sizes, _offline_pending: true };
      });
    }
    if (method === "PUT" && responseRecord) {
      return records.map((record) => record.id === recordId ? responseRecord : record);
    }
    if (method === "DELETE") return records.filter((record) => record.id !== recordId);
    return records;
  });

  if (
    target.collection === "stock_movements" &&
    (route === collectionPath && method === "POST" || method === "DELETE")
  ) {
    const movement = method === "DELETE" ? entry.sourceRecord : entry.data;
    const productsPath = "/products";
    const productEntries = await cacheRecords(ownerId, productsPath);
    if (productEntries.length) {
      const direction = method === "DELETE" ? -1 : 1;
      const qty = movementStockDelta(movement) * direction;
      await putCachedRecords(ownerId, productEntries, (cached) => {
        if (!Array.isArray(cached.data)) return cached.data;
        const products = cached.data.map((product) => ({ ...product, sizes: (product.sizes || []).map((size) => ({ ...size })) }));
        adjustProductStock(products, movement?.product_id, movement?.size, qty);
        return products;
      });
    }
  }
};

const getBaseline = async (entry, ownerId) => {
  const target = entry.conflictTarget || getConflictTarget(entry);
  if (!target) return null;
  if (target.action === "number-sequence") {
    return readCachedApiResponse("/orders/number-sequence");
  }
  if (target.action === "mark_paid") {
    const cached = await cacheRecords(ownerId, `/${target.collection}`);
    return cached.find((item) => Array.isArray(item.data))?.data || null;
  }
  const isCollectionCreate =
    entry.method.toUpperCase() === "POST" &&
    routePath(entry.url).split("/").filter(Boolean).length === 1 &&
    target.collection === routePath(entry.url).split("/").filter(Boolean)[0];
  if (!target.id || isCollectionCreate) return null;
  const cached = await cacheRecords(ownerId, `/${target.collection}`);
  const singleton = cached.find((item) => !Array.isArray(item.data));
  if (singleton && target.id === "singleton") return singleton.data;
  const records = cached.find((item) => Array.isArray(item.data))?.data || [];
  return records.find((item) => item.id === target.id) || null;
};

export const queueOfflineMutation = async (config) => {
  const ownerId = activeUserId;
  const path = apiPath(config.url, config.baseURL);
  if (!ownerId || isExcludedPath(path)) {
    throw new Error("Esta ação exige conexão e uma sessão autenticada.");
  }

  const method = (config.method || "post").toUpperCase();
  let data = config.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { /* Keep non-JSON request data unchanged. */ }
  }
  const entry = {
    id: config.headers?.["X-Offline-Operation-Id"] || createId(),
    ownerId,
    method,
    url: config.url,
    data,
    status: "pending",
    queuedOffline: true,
    createdAt: new Date().toISOString(),
    conflictTarget: await resolveConflictTarget({ method, url: config.url, data }, ownerId),
    localBaseline: await getBaseline({
      method,
      url: config.url,
      data,
      conflictTarget: getTarget({ method, url: config.url, data }),
    }, ownerId),
    sourceRecord: null,
    baseline: null,
    requiresBaseline: !(
      method === "POST" &&
      routePath(config.url).split("/").filter(Boolean).length === 1 &&
      getTarget({ method, url: config.url, data })?.collection ===
        getConflictTarget({ method, url: config.url, data })?.collection
    ),
    error: "",
  };
  if (method === "DELETE") entry.sourceRecord = entry.localBaseline;
  entry.baseline = await getBaseline(entry, ownerId);

  await storeQueueEntry(entry);
  try {
    await updateCachedCollections(entry, data, ownerId);
  } catch (error) {
    console.error("A alteração foi enfileirada, mas não foi possível atualizar a cópia local.", error);
    entry.error = "A alteração está aguardando sincronização, mas a lista local pode estar desatualizada.";
    await updateQueueEntry(entry);
  }
  notifyQueueChange();
  return entry;
};

export const getOfflineQueue = async (ownerId = activeUserId) => {
  if (!ownerId) return [];
  const entries = await storeRequest(QUEUE_STORE, "readonly", (store) =>
    store.index("ownerId").getAll(ownerId),
  );
  return entries.sort((first, second) =>
    Number(first.sequence || 0) - Number(second.sequence || 0) ||
    first.createdAt.localeCompare(second.createdAt),
  );
};

const tokenForCurrentSession = () =>
  localStorage.getItem("lokal_token") || sessionStorage.getItem("lokal_token");

const fetchRemoteRecord = async (entry) => {
  const target = entry.conflictTarget || getConflictTarget(entry);
  if (!target) return { available: false, record: null };
  const token = tokenForCurrentSession();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (target.action === "number-sequence") {
    const sequenceResponse = await axios.get(`${API}/orders/number-sequence`, { headers });
    return { available: true, record: sequenceResponse.data };
  }
  const response = await axios.get(`${API}/${target.collection}`, { headers });
  if (target.id) {
    const record = (Array.isArray(response.data) ? response.data : [response.data])
      .find((item) => item.id === target.id);
    return { available: true, record: record || null };
  }
  return { available: true, record: response.data };
};

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const updateQueueEntry = async (entry) =>
  storeRequest(QUEUE_STORE, "readwrite", (store) => store.put(entry));

const removeQueueEntry = async (id) =>
  storeRequest(QUEUE_STORE, "readwrite", (store) => store.delete(id));

const updateNextBaseline = async (entry) => {
  const target = entry.conflictTarget || getConflictTarget(entry);
  if (!target?.id) return;
  const laterEntries = await getOfflineQueue(entry.ownerId);
  const next = laterEntries.find((candidate) =>
    candidate.id !== entry.id &&
    candidate.status === "pending" &&
    (candidate.conflictTarget || getConflictTarget(candidate))?.collection === target.collection &&
    (candidate.conflictTarget || getConflictTarget(candidate))?.id === target.id,
  );
  if (next) {
    try {
      const remote = await fetchRemoteRecord(entry);
      if (!remote.record) {
        next.status = "conflict";
        next.error = "A alteração anterior foi sincronizada, mas o registro não está disponível para verificar a próxima.";
      } else {
        next.baseline = remote.record;
      }
    } catch {
      next.status = "conflict";
      next.error = "A alteração anterior foi sincronizada. A conexão caiu antes de verificar a próxima alteração.";
    }
    await updateQueueEntry(next);
  }
};

const replaceCachedRecord = async (entry, record) => {
  const target = getTarget(entry);
  if (!target) return;
  if (target.action === "number-sequence" && entry.method.toUpperCase() === "PUT") {
    await storeRequest(CACHE_STORE, "readwrite", (store) =>
      store.put({
        key: cacheKey(entry.ownerId, entry.url),
        ownerId: entry.ownerId,
        data: record,
      }),
    );
    return;
  }
  const collections = await cacheRecords(entry.ownerId, `/${target.collection}`);
  const route = routePath(entry.url);
  const method = entry.method.toUpperCase();
  if (!collections.length) return;
  await putCachedRecords(entry.ownerId, collections, (cached) => {
    if (!Array.isArray(cached.data)) {
      if (method === "PUT" && route === `/${target.collection}` && record?.id === "singleton") return record;
      return cached.data;
    }
    if (method === "DELETE") return cached.data.filter((item) => item.id !== target.id);
    if (!record?.id) return cached.data;
    const exists = cached.data.some((item) => item.id === record.id);
    return exists
      ? cached.data.map((item) => item.id === record.id ? record : item)
      : [record, ...cached.data];
  });
};

const refreshRelatedCache = async (entry) => {
  const route = routePath(entry.url);
  const method = entry.method.toUpperCase();
  const endpoints = new Set();
  if (route.startsWith("/stock_movements")) {
    endpoints.add("/products");
    endpoints.add("/stock_movements");
  }
  if (route.startsWith("/products/") && route.endsWith("/desmontar")) {
    endpoints.add("/products");
    endpoints.add("/stock_movements");
  }
  if (route.startsWith("/orders/") && route !== "/orders/number-sequence") {
    endpoints.add("/orders");
    endpoints.add("/products");
    endpoints.add("/stock_movements");
    if (method === "DELETE") {
      endpoints.add("/expenses");
      endpoints.add("/commissions");
    } else if (route.endsWith("/fulfill")) {
      endpoints.add("/expenses");
      endpoints.add("/customers");
    } else if (method === "PUT") {
      endpoints.add("/commissions");
    }
  }
  if (!endpoints.size) return;

  const token = tokenForCurrentSession();
  const headers = token ? { Authorization: "Bearer " + token } : {};
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${API}${endpoint}`, { headers });
      await storeRequest(CACHE_STORE, "readwrite", (store) =>
        store.put({
          key: cacheKey(entry.ownerId, endpoint),
          ownerId: entry.ownerId,
          data: response.data,
        }),
      );
    } catch (error) {
      console.error(`Não foi possível atualizar o cache de ${endpoint} após a sincronização.`, error);
    }
  }
};

export const syncOfflineQueue = async () => {
  const ownerId = activeUserId;
  if (!ownerId || !navigator.onLine || inFlightSyncs.has(ownerId)) return;
  inFlightSyncs.add(ownerId);
  try {
    const entries = await getOfflineQueue(ownerId);
    for (const queuedEntry of entries) {
      const entry = (await getOfflineQueue(ownerId)).find((item) => item.id === queuedEntry.id);
      if (!entry) continue;
      if (entry.status !== "pending") break;
      if (entry.requiresBaseline && !entry.baseline) {
        entry.status = "conflict";
        entry.error = "Não há uma cópia local da versão anterior para comparar. Revise esta alteração antes de enviar.";
        await updateQueueEntry(entry);
        notifyQueueChange();
        break;
      }
      if (entry.baseline) {
        try {
          const remote = await fetchRemoteRecord(entry);
          if (!remote.available || !remote.record || stableJson(remote.record) !== stableJson(entry.baseline)) {
            entry.status = "conflict";
            entry.error = !remote.record
              ? "O registro foi removido no servidor ou não está acessível."
              : "O registro mudou no servidor enquanto este dispositivo estava offline.";
            await updateQueueEntry(entry);
            notifyQueueChange();
            break;
          }
        } catch (error) {
          if (!navigator.onLine || !error.response) break;
          entry.status = "conflict";
          entry.serverRejected = true;
          entry.error = error.response?.data?.detail || "Não foi possível verificar a versão do registro no servidor.";
          await updateQueueEntry(entry);
          notifyQueueChange();
          break;
        }
      }

      try {
        const token = tokenForCurrentSession();
        const headers = {
          "X-Offline-Operation-Id": entry.id,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const response = await axios.request({
          baseURL: API,
          url: entry.url,
          method: entry.method,
          data: entry.data,
          headers,
        });
        await replaceCachedRecord(entry, response.data);
        await removeQueueEntry(entry.id);
        await refreshRelatedCache(entry);
        await updateNextBaseline(entry);
        notifyQueueChange();
      } catch (error) {
        if (!navigator.onLine || !error.response) break;
        if (error.response.status === 401) break;
        if (error.response.status === 409 && error.response.data?.detail?.includes("ainda está sendo processada")) break;
        entry.status = "conflict";
        entry.serverRejected = true;
        entry.error = error.response?.data?.detail || "A API recusou esta alteração; revise antes de reenviar.";
        await updateQueueEntry(entry);
        notifyQueueChange();
        break;
      }
    }
  } catch (error) {
    console.error("Falha ao sincronizar alterações offline.", error);
  } finally {
    inFlightSyncs.delete(ownerId);
    notifyQueueChange();
  }
};

export const applyOfflineConflict = async (entryId) => {
  const queue = await getOfflineQueue();
  const entry = queue.find((item) => item.id === entryId);
  if (!entry || entry.status !== "conflict") return;
  if (entry.serverRejected) {
    throw new Error("A API recusou esta ação. Verifique o motivo antes de descartá-la ou registrá-la novamente.");
  }
  try {
    const remote = await fetchRemoteRecord(entry);
    if (!remote.record) {
      entry.error = "O registro não existe no servidor. Descarte esta alteração ou recrie o cadastro.";
      await updateQueueEntry(entry);
      notifyQueueChange();
      return;
    }
    entry.baseline = remote.record;
    entry.status = "pending";
    entry.error = "";
    await updateQueueEntry(entry);
    notifyQueueChange();
    await syncOfflineQueue();
  } catch (error) {
    console.error("Não foi possível atualizar a versão do registro para revisão.", error);
    throw error;
  }
};

export const discardOfflineChange = async (entryId) => {
  const queue = await getOfflineQueue();
  const entry = queue.find((item) => item.id === entryId);
  if (!entry) return;
  const target = entry.conflictTarget || getConflictTarget(entry);
  const entryIndex = queue.findIndex((item) => item.id === entryId);
  const dependent = queue.slice(entryIndex + 1).some((candidate) => {
    const candidateTarget = candidate.conflictTarget || getConflictTarget(candidate);
    return target?.id && candidateTarget?.collection === target.collection && candidateTarget?.id === target.id ||
      target?.id && JSON.stringify(candidate.data).includes(target.id);
  });
  if (dependent) {
    throw new Error("Descarte primeiro as alterações posteriores que dependem deste registro.");
  }

  const localTarget = getTarget(entry);
  if (localTarget?.action === "number-sequence" && entry.localBaseline) {
    await storeRequest(CACHE_STORE, "readwrite", (store) =>
      store.put({
        key: cacheKey(entry.ownerId, entry.url),
        ownerId: entry.ownerId,
        data: entry.localBaseline,
      }),
    );
  } else if (localTarget) {
    const collections = await cacheRecords(entry.ownerId, `/${localTarget.collection}`);
    await putCachedRecords(entry.ownerId, collections, (cached) => {
      if (!Array.isArray(cached.data)) {
        if (localTarget.collection === "settings" && entry.localBaseline) return entry.localBaseline;
        return cached.data;
      }
      if (entry.method === "POST" && routePath(entry.url) === `/${localTarget.collection}`) {
        return cached.data.filter((record) => record.id !== entry.data?.id);
      }
      if (localTarget.action === "mark_paid" && Array.isArray(entry.localBaseline)) {
        return entry.localBaseline;
      }
      const existingIndex = cached.data.findIndex((record) => record.id === localTarget.id);
      if (entry.method === "DELETE" && entry.localBaseline) {
        return existingIndex >= 0
          ? cached.data.map((record) => record.id === localTarget.id ? entry.localBaseline : record)
          : [entry.localBaseline, ...cached.data];
      }
      if (entry.localBaseline) {
        return existingIndex >= 0
          ? cached.data.map((record) => record.id === localTarget.id ? entry.localBaseline : record)
          : cached.data;
      }
      return cached.data;
    });
  }

  const route = routePath(entry.url);
  if (localTarget?.collection === "stock_movements" && (entry.method === "POST" || entry.method === "DELETE")) {
    const movement = entry.method === "DELETE" ? entry.sourceRecord : entry.data;
    const productEntries = await cacheRecords(entry.ownerId, "/products");
    await putCachedRecords(entry.ownerId, productEntries, (cached) => {
      if (!Array.isArray(cached.data)) return cached.data;
      const products = cached.data.map((product) => ({
        ...product,
        sizes: (product.sizes || []).map((size) => ({ ...size })),
      }));
      const direction = entry.method === "DELETE" ? 1 : -1;
      adjustProductStock(products, movement?.product_id, movement?.size, movementStockDelta(movement) * direction);
      return products;
    });
  }

  await removeQueueEntry(entryId);
  notifyQueueChange();
};
