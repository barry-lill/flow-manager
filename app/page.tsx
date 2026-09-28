"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Stock = {
  stockCode: string;
  description: string;
  quantity: number;
  targetLevel: number;
  stockGroup: string;
};

type PurchaseOrder = {
  poNumber: string;
  stockCode: string;
  description: string;
  supplier: string;
  orderDate: string;
  dueDate: string;
  quantityOutstanding: number;
};

function first(row: Record<string, unknown>, names: string[]) {
  const key = Object.keys(row).find((k) => names.includes(k.trim()));
  return key ? row[key] : undefined;
}

function toNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [message, setMessage] = useState("Upload a Sage 50 Product Details export to begin.");

  const visibleStocks = useMemo(
    () => selectedGroups.length === 0 ? stocks : stocks.filter((s) => selectedGroups.includes(s.stockGroup)),
    [stocks, selectedGroups]
  );

  async function importProducts(file: File) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    const imported: Stock[] = rows
      .filter((row) => toNumber(first(row, ["ProductRecord.InactiveFlag", "InactiveFlag"])) !== 1)
      .map((row) => ({
        stockCode: String(first(row, ["ProductRecord.AccountReference", "AccountReference"]) ?? ""),
        description: String(first(row, ["ProductRecord.Description", "Description"]) ?? ""),
        quantity: toNumber(first(row, ["ProductRecord.QuantityInStock", "QuantityInStock"])),
        targetLevel: toNumber(first(row, ["ProductRecord.QuantityReOrderLevel", "QuantityReOrderLevel"])),
        stockGroup: String(first(row, ["ProductRecord.CategoryName", "CategoryName"]) ?? ""),
      }))
      .filter((s) => s.stockCode);

    const uniqueGroups = [...new Set(imported.map((s) => s.stockGroup).filter(Boolean))].sort();
    setStocks(imported);
    setGroups(uniqueGroups);
    setSelectedGroups([]);
    setMessage(`Imported ${imported.length.toLocaleString()} active products from ${file.name}.`);
  }

  async function importPurchaseOrders(file: File) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    const imported: PurchaseOrder[] = rows
      .map((row) => {
        const ordered = toNumber(first(row, ["PurchaseOrderItem.Quantity", "Quantity"]));
        const delivered = toNumber(first(row, ["PurchaseOrderItem.QuantityDelivered", "QuantityDelivered"]));
        return {
          poNumber: String(first(row, ["PurchaseOrder.Number", "Number"]) ?? ""),
          stockCode: String(first(row, ["PurchaseOrderItem.ProductAccountReference", "ProductAccountReference"]) ?? ""),
          description: String(first(row, ["PurchaseOrderItem.Description", "Description"]) ?? ""),
          supplier: String(first(row, ["PurchaseOrder.AccountName", "AccountName"]) ?? ""),
          orderDate: parseDate(first(row, ["PurchaseOrder.Date", "Date"])),
          dueDate: parseDate(first(row, ["PurchaseOrder.DateDelivery", "DateDelivery"])),
          quantityOutstanding: Math.max(0, ordered - delivered),
        };
      })
      .filter((p) => p.poNumber && p.stockCode && p.quantityOutstanding > 0);

    setOrders(imported);
    setMessage(`Imported ${imported.length.toLocaleString()} open/part-delivered PO lines from ${file.name}.`);
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <div className="eyebrow">FLOW MANAGER</div>
          <h1>Flow, without the fuss.</h1>
        </div>
        <span className="version">v0.1</span>
      </header>

      <section className="hero">
        <h2>Dutch Maid</h2>
        <p>{message}</p>
        <div className="uploads">
          <label className="upload">
            <span>Import Sage Product Details</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && importProducts(e.target.files[0])} />
          </label>
          <label className="upload secondary">
            <span>Import Sage Purchase Orders</span>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && importPurchaseOrders(e.target.files[0])} />
          </label>
        </div>
      </section>

      {groups.length > 0 && (
        <section className="card">
          <div className="section-heading">
            <div><h3>Stock Groups</h3><p>All active products are imported. Choose what to display.</p></div>
            <button onClick={() => setSelectedGroups([])}>Show all</button>
          </div>
          <div className="chips">
            {groups.map((group) => (
              <button key={group} className={selectedGroups.includes(group) ? "chip selected" : "chip"} onClick={() => setSelectedGroups((current) => current.includes(group) ? current.filter((g) => g !== group) : [...current, group])}>
                {group || "(No group)"}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid">
        <div className="card metric"><span>Products</span><strong>{visibleStocks.length.toLocaleString()}</strong></div>
        <div className="card metric"><span>PO lines</span><strong>{orders.length.toLocaleString()}</strong></div>
        <div className="card metric"><span>Groups</span><strong>{groups.length.toLocaleString()}</strong></div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div><h3>Stock</h3><p>Current Sage 50 stock position.</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Stock code</th><th>Description</th><th>Stock group</th><th>Stock</th><th>Target</th><th>Buffer</th></tr></thead>
            <tbody>
              {visibleStocks.slice(0, 100).map((stock) => {
                const pct = stock.targetLevel > 0 ? stock.quantity / stock.targetLevel : 0;
                const status = pct > 1 ? "blue" : pct >= .66 ? "green" : pct >= .33 ? "yellow" : pct > 0 ? "red" : "black";
                return <tr key={stock.stockCode}><td>{stock.stockCode}</td><td>{stock.description}</td><td>{stock.stockGroup}</td><td>{stock.quantity}</td><td>{stock.targetLevel}</td><td><span className={`status ${status}`}>{status}</span></td></tr>;
              })}
              {visibleStocks.length === 0 && <tr><td colSpan={6} className="empty">Upload the Sage Product Details export.</td></tr>}
            </tbody>
          </table>
        </div>
        {visibleStocks.length > 100 && <p className="footnote">Showing the first 100 rows for now.</p>}
      </section>
    </main>
  );
}
