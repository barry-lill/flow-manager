"use client";

import { useEffect } from "react";

type FilterState = Record<number, string>;

const labels = ["PO", "PTA/PTO", "Stock code", "Description", "Supplier", "Order date", "Due date", "Outstanding", "Buffer"];
const numericColumns = new Set([7, 8]);

function numberFromCell(text: string) {
  const n = Number(text.replace(/[% ,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function PurchaseOrderTableEnhancer() {
  useEffect(() => {
    let filters: FilterState = {};
    let sort: { column: number; direction: "asc" | "desc" } | null = null;
    let activeMenu: HTMLElement | null = null;

    function closeMenu() {
      activeMenu?.remove();
      activeMenu = null;
      document.querySelectorAll("#purchase-orders .column-filter-button.open").forEach(el => el.classList.remove("open"));
    }

    function rows() {
      return Array.from(document.querySelectorAll<HTMLTableRowElement>("#purchase-orders .po-table tbody tr")).filter(row => !row.querySelector(".empty"));
    }

    function apply() {
      const body = document.querySelector<HTMLTableSectionElement>("#purchase-orders .po-table tbody");
      if (!body) return;
      const allRows = rows();
      allRows.forEach(row => {
        const cells = Array.from(row.cells);
        const visible = Object.entries(filters).every(([key, value]) => {
          if (!value) return true;
          const column = Number(key);
          const text = cells[column]?.textContent?.trim() || "";
          if (numericColumns.has(column)) {
            const [minText, maxText] = value.split("|");
            const number = numberFromCell(text);
            if (minText !== "" && number < Number(minText)) return false;
            if (maxText !== "" && number > Number(maxText)) return false;
            return true;
          }
          return text.toLowerCase().includes(value.toLowerCase());
        });
        row.style.display = visible ? "" : "none";
      });

      if (sort) {
        allRows.sort((a, b) => {
          const av = a.cells[sort!.column]?.textContent?.trim() || "";
          const bv = b.cells[sort!.column]?.textContent?.trim() || "";
          const comparison = numericColumns.has(sort!.column)
            ? numberFromCell(av) - numberFromCell(bv)
            : av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
          return sort!.direction === "asc" ? comparison : -comparison;
        }).forEach(row => body.appendChild(row));
      }
    }

    function clearAll() {
      filters = {};
      sort = null;
      closeMenu();
      rows().forEach(row => { row.style.display = ""; });
      const table = document.querySelector<HTMLTableElement>("#purchase-orders .po-table");
      if (table) table.dataset.poEnhanced = "";
      enhance();
    }

    function makeMenu(column: number, button: HTMLButtonElement) {
      closeMenu();
      button.classList.add("open");
      const menu = document.createElement("div");
      menu.className = "column-filter-menu po-column-filter-menu";
      menu.innerHTML = `<strong>${labels[column]}</strong>`;

      const asc = document.createElement("button");
      asc.type = "button";
      asc.textContent = `Sort ascending ${sort?.column === column && sort.direction === "asc" ? "✓" : ""}`;
      asc.onclick = e => { e.stopPropagation(); sort = { column, direction: "asc" }; apply(); closeMenu(); };
      menu.appendChild(asc);

      const desc = document.createElement("button");
      desc.type = "button";
      desc.textContent = `Sort descending ${sort?.column === column && sort.direction === "desc" ? "✓" : ""}`;
      desc.onclick = e => { e.stopPropagation(); sort = { column, direction: "desc" }; apply(); closeMenu(); };
      menu.appendChild(desc);

      const divider = document.createElement("div");
      divider.className = "filter-divider";
      menu.appendChild(divider);

      if (numericColumns.has(column)) {
        const wrap = document.createElement("div");
        wrap.className = "filter-number-row";
        const [currentMin = "", currentMax = ""] = (filters[column] || "|").split("|");
        const min = document.createElement("input");
        min.placeholder = "Min";
        min.value = currentMin;
        const max = document.createElement("input");
        max.placeholder = "Max";
        max.value = currentMax;
        const change = () => { filters[column] = `${min.value}|${max.value}`; apply(); };
        min.oninput = change;
        max.oninput = change;
        wrap.append(min, max);
        menu.appendChild(wrap);
      } else {
        const input = document.createElement("input");
        input.placeholder = column === 2 ? "Contains... e.g. RM73" : "Contains...";
        input.value = filters[column] || "";
        input.oninput = () => { filters[column] = input.value; apply(); };
        menu.appendChild(input);
        setTimeout(() => input.focus(), 0);
      }

      button.parentElement?.appendChild(menu);
      activeMenu = menu;
    }

    function enhance() {
      const table = document.querySelector<HTMLTableElement>("#purchase-orders .po-table");
      if (!table || table.dataset.poEnhanced === "1") return;
      table.dataset.poEnhanced = "1";
      const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
      headers.forEach((th, column) => {
        th.classList.add("filterable-th");
        const label = labels[column] || th.textContent?.trim() || "Column";
        th.textContent = "";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "column-filter-button";
        button.innerHTML = `<span>${label}</span><span>▾</span>`;
        button.onclick = e => {
          e.stopPropagation();
          if (activeMenu && activeMenu.parentElement === th) closeMenu();
          else makeMenu(column, button);
        };
        th.appendChild(button);
      });

      const heading = document.querySelector("#purchase-orders .section-heading");
      if (heading && !heading.querySelector(".po-clear-filters")) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "po-clear-filters";
        clear.textContent = "Clear filters & sort";
        clear.onclick = clearAll;
        heading.appendChild(clear);
      }
      apply();
    }

    const observer = new MutationObserver(() => enhance());
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();
    const outside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest("#purchase-orders .filterable-th")) closeMenu();
    };
    document.addEventListener("mousedown", outside);
    return () => { observer.disconnect(); document.removeEventListener("mousedown", outside); closeMenu(); };
  }, []);

  return null;
}
