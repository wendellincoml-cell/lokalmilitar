import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";

export default function ProductSearchSelect({
  products,
  value,
  onChange,
  placeholder = "Buscar produto por nome ou SKU...",
  className = "",
  inputClassName = "input",
  testid,
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const selectedProduct = products.find((product) => product.id === value);
  const options = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return products.filter((product) => (
      !search || `${product.name || ""} ${product.sku || ""}`.toLocaleLowerCase().includes(search)
    )).slice(0, 100);
  }, [products, query]);

  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
      <input
        className={`${inputClassName} w-full pl-8`}
        value={focused ? query : selectedProduct ? `${selectedProduct.name} (${selectedProduct.sku})` : ""}
        placeholder={placeholder}
        onFocus={() => { setQuery(""); setFocused(true); }}
        onBlur={() => setFocused(false)}
        onChange={(event) => setQuery(event.target.value)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={focused}
        aria-controls={testid ? `${testid}-options` : undefined}
        data-testid={testid}
      />
      {focused && (
        <div
          id={testid ? `${testid}-options` : undefined}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded border border-neutral-300 bg-white shadow-lg"
        >
          {options.map((product) => (
            <button
              key={product.id}
              type="button"
              role="option"
              aria-selected={product.id === value}
              className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-[#F4EFE3]"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(product.id);
                setQuery("");
                setFocused(false);
              }}
            >
              <span className="font-medium">{product.name}</span>
              <span className="ml-2 text-xs text-neutral-500">{product.sku}</span>
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-neutral-500">Nenhum produto encontrado pelo nome ou SKU.</div>
          )}
        </div>
      )}
    </div>
  );
}
