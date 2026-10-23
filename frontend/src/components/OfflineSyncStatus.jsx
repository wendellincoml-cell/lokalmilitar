import React, { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  applyOfflineConflict,
  discardOfflineChange,
  getOfflineQueue,
  offlineQueueEvent,
  syncOfflineQueue,
} from "@/lib/offlineSync";

const operationLabel = (entry) => {
  const segments = entry.url.split("?")[0].split("/").filter(Boolean)
    .filter((segment) => segment !== "api");
  const collection = segments[0];
  const labels = {
    categories: "Categoria",
    commissions: "Comissão",
    customers: "Cliente",
    expenses: "Despesa ou viagem",
    orders: "Pedido",
    products: "Produto",
    settings: "Configurações",
    stock_movements: "Movimentação de estoque",
    suppliers: "Fornecedor",
    vehicles: "Veículo",
    vendors: "Vendedor",
  };
  const action = entry.method === "DELETE" ? "Excluir" : entry.method === "PUT" ? "Atualizar" : "Adicionar";
  return `${action} · ${labels[collection] || "Alteração"}`;
};

export default function OfflineSyncStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState([]);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const previousQueueLength = useRef(null);

  const refresh = useCallback(async () => {
    setOnline(navigator.onLine);
    try {
      const nextQueue = await getOfflineQueue();
      if (previousQueueLength.current !== null && nextQueue.length > previousQueueLength.current) {
        toast.info("Alteração salva neste aparelho e aguardando sincronização.", { id: "offline-queued" });
      }
      if (nextQueue.length === 0) toast.dismiss("offline-queued");
      previousQueueLength.current = nextQueue.length;
      setQueue(nextQueue);
    } catch (error) {
      console.error("Não foi possível consultar as alterações offline.", error);
      toast.error("Não foi possível ler a fila de sincronização offline.");
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener(offlineQueueEvent, refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener(offlineQueueEvent, refresh);
    };
  }, [refresh]);

  const reviewAndApply = async (entryId) => {
    setWorking(true);
    try {
      await applyOfflineConflict(entryId);
      await refresh();
      const remaining = (await getOfflineQueue()).find((entry) => entry.id === entryId);
      if (remaining) {
        toast.error(remaining.error || "A alteração continua pendente de sincronização.");
      } else {
        toast.success("Alteração sincronizada.");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || "Não foi possível sincronizar a alteração.");
    } finally {
      setWorking(false);
    }
  };

  const discard = async (entryId) => {
    try {
      await discardOfflineChange(entryId);
      await refresh();
      toast.success("Alteração pendente descartada.");
    } catch (error) {
      console.error("Não foi possível descartar a alteração offline.", error);
      toast.error(error.message || "Não foi possível descartar a alteração pendente.");
    }
  };

  const retry = async () => {
    setWorking(true);
    try {
      await syncOfflineQueue();
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  if (online && queue.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="fixed bottom-4 right-4 z-40 flex min-h-11 items-center gap-2 rounded-full border border-neutral-700 bg-[#111] px-4 py-2 text-sm font-semibold text-white shadow-lg"
        onClick={() => setOpen(true)}
        aria-label={`Sincronização ${online ? "pendente" : "offline"}${queue.length ? `, ${queue.length} alterações` : ""}`}
        data-testid="offline-sync-status"
      >
        {online ? <Cloud size={17} /> : <CloudOff size={17} />}
        <span>{online ? "Sincronização" : "Offline"}</span>
        {queue.length > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs text-black">{queue.length}</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="offline-sync-dialog">
          <DialogHeader>
            <DialogTitle className="font-head">Sincronização offline</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-600" role="status">
            {online
              ? "O aparelho está conectado. Alterações pendentes serão enviadas em ordem."
              : "As alterações ficam neste aparelho e serão enviadas quando a conexão voltar."}
          </p>
          {queue.length === 0 ? (
            <p className="py-4 text-sm">Nenhuma alteração pendente.</p>
          ) : (
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
              {queue.map((entry) => (
                <li key={entry.id} className="rounded border border-neutral-300 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{operationLabel(entry)}</div>
                      <div className="mt-1 text-xs text-neutral-600">
                        {entry.status === "conflict" ? "Precisa de revisão" : "Aguardando envio"}
                        {" · "}
                        {new Date(entry.createdAt).toLocaleString("pt-BR")}
                      </div>
                      {entry.error && <p className="mt-2 text-xs text-red-700">{entry.error}</p>}
                    </div>
                    <button
                      type="button"
                      className="rounded p-2 text-red-700 hover:bg-red-50"
                      onClick={() => discard(entry.id)}
                      aria-label={`Descartar: ${operationLabel(entry)}`}
                      data-testid={`offline-discard-${entry.id}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {entry.status === "conflict" && !entry.serverRejected && (
                    <button
                      type="button"
                      className="lm-btn lm-btn-olive mt-3"
                      disabled={!online || working}
                      onClick={() => reviewAndApply(entry.id)}
                      data-testid={`offline-apply-${entry.id}`}
                    >
                      Revisar e aplicar minha alteração
                    </button>
                  )}
                  {entry.status === "conflict" && entry.serverRejected && (
                    <p className="mt-3 text-xs text-neutral-600">
                      A alteração não será reenviada automaticamente para evitar duplicidade. Confirme o resultado no sistema antes de descartá-la.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {online && queue.some((entry) => entry.status === "pending") && (
            <button type="button" className="lm-btn lm-btn-outline" disabled={working} onClick={retry}>
              <RefreshCw size={15} className={working ? "animate-spin" : ""} />
              Sincronizar agora
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
