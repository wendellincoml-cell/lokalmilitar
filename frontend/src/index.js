import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

const removeLegacyOfflineData = async () => {
  localStorage.removeItem("lokal_user");
  sessionStorage.removeItem("lokal_user");

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const legacyWorkerUrl = new URL("/service-worker.js", window.location.origin).href;
      await Promise.all(registrations
        .filter((registration) =>
          [registration.active, registration.waiting, registration.installing]
            .some((worker) => worker?.scriptURL === legacyWorkerUrl),
        )
        .map((registration) => registration.unregister()));
    } catch (error) {
      console.error("Não foi possível remover o service worker antigo.", error);
    }
  }

  if ("caches" in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames
        .filter((name) => name.startsWith("lokal-militar-pwa-"))
        .map((name) => caches.delete(name)));
    } catch (error) {
      console.error("Não foi possível remover o cache antigo do app.", error);
    }
  }

  if ("indexedDB" in window) {
    try {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("lokal-militar-offline");
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error || new Error("Falha ao remover dados locais antigos."));
        request.onblocked = () => reject(new Error("Feche outras abas do app para remover os dados locais antigos."));
      });
    } catch (error) {
      console.error("Não foi possível remover os dados locais antigos.", error);
    }
  }
};

removeLegacyOfflineData();
