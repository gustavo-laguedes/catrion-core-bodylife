window.CorePageModules = window.CorePageModules || {};

window.CorePageModules.contas = function () {
  const content = document.getElementById("contasContent");

  const canViewReports = !!window.CoreAuth?.can?.("canViewReports");

  if (!canViewReports) {
    content.innerHTML = `
      <div class="r-card">
        <div class="r-head">
          <div>
            <div class="r-title">🔒 Contas a pagar bloqueado</div>
            <div class="r-sub">Seu perfil não possui acesso a esta área.</div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  window.setActiveSidebar?.("contas");

  let apPayablesCache = [];
  let apCategoriesCache = [];

  let searchTerm = "";
  let selectedStatus = "all";
  let selectedCategories = new Set();
  let periodMode = "day"; // padrão: hoje
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedISO = "";
let listLimit = 12;
let rangeStart = "";
let rangeEnd = "";

let selectedMonthFilter = null;
let selectedYearFilter = null;

  let expandedCategories = new Set();

  const STATUS_LABELS = {
  all: "Todos os status",
  open: "Em aberto",
  pending: "Pendentes",
  today: "Vence hoje",
  late: "Atrasadas",
  soon7: "Próximos 7 dias",
  paid: "Pagas"
};

  const rModal = document.getElementById("rModal");
  const rModalTitle = document.getElementById("rModalTitle");
  const rModalBody = document.getElementById("rModalBody");
  const rModalClose = document.getElementById("rModalClose");
  const rModalOk = document.getElementById("rModalOk");

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function moneyBR(v) {
    return Number(v || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function uid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function parseISODate(iso) {
    if (!iso) return null;
    const s = String(iso).trim();

    if (s.includes("T")) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }

    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  function toISODate(d) {
    const x = new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const da = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  function diffDays(a, b) {
    const A = new Date(a);
    const B = new Date(b);
    A.setHours(0, 0, 0, 0);
    B.setHours(0, 0, 0, 0);
    return Math.floor((B.getTime() - A.getTime()) / 86400000);
  }

  function monthRange(year, month) {
    return {
      s: new Date(year, month, 1, 0, 0, 0, 0),
      e: new Date(year, month + 1, 0, 23, 59, 59, 999)
    };
  }

  function formatMonthTitle(year, month) {
    const nomes = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    return `${nomes[month]} / ${year}`;
  }

  function apStatus(item) {
    if (item.status === "paid") return "paid";

    const due = parseISODate(item.dueDate);
    if (!due) return "pending";

    const today = todayStart();

    if (due.getTime() < today.getTime()) return "late";
    if (due.getTime() === today.getTime()) return "today";

    return "pending";
  }

  function apBadge(st) {
    if (st === "paid") return `<span class="ap-badge paid">Paga</span>`;
    if (st === "late") return `<span class="ap-badge late">Atrasada</span>`;
    if (st === "today") return `<span class="ap-badge today">Vence hoje</span>`;
    return `<span class="ap-badge pending">Pendente</span>`;
  }

  function sum(list) {
    return (list || []).reduce((acc, x) => acc + Number(x.amount || 0), 0);
  }

  function normalize(v) {
    return String(v || "").trim().toLowerCase();
  }

  function openModal(title, html) {
    rModalTitle.textContent = title;
    rModalBody.innerHTML = html;
    rModal.classList.remove("hidden");
    rModalOk.style.display = "none";
  }

  function closeModal() {
    rModal.classList.add("hidden");
    rModalOk.style.display = "";
  }

  rModalClose.onclick = closeModal;
  rModalOk.onclick = closeModal;
  rModal.addEventListener("click", (e) => {
    if (e.target === rModal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (!rModal.classList.contains("hidden") && e.key === "Escape") closeModal();
  });

  async function loadAPCats() {
    try {
      if (!window.APCategoriesStore?.list) {
        apCategoriesCache = [];
        return [];
      }

      apCategoriesCache = await window.APCategoriesStore.list({
        limit: 1000,
        orderBy: "name",
        ascending: true
      });

      return apCategoriesCache || [];
    } catch (err) {
      console.error("[CONTAS] Erro ao carregar categorias:", err);
      apCategoriesCache = [];
      return [];
    }
  }

  async function loadAP() {
    try {
      if (!window.APPayablesStore?.list) {
        apPayablesCache = [];
        return [];
      }

      apPayablesCache = await window.APPayablesStore.list({
        limit: 5000,
        orderBy: "due_date",
        ascending: true
      });

      return apPayablesCache || [];
    } catch (err) {
      console.error("[CONTAS] Erro ao carregar contas:", err);
      apPayablesCache = [];
      return [];
    }
  }

  function getCategoryNames(all) {
    const fromAccounts = (all || [])
      .map(x => String(x.category || "").trim())
      .filter(Boolean);

    const fromStore = (apCategoriesCache || [])
      .map(x => String(x.name || "").trim())
      .filter(Boolean);

    return [...new Set([...fromStore, ...fromAccounts])]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function matchesSearch(item) {
    if (!searchTerm) return true;

    const hay = [
      item.title,
      item.category,
      item.supplier,
      item.notes
    ].map(normalize).join(" ");

    return hay.includes(searchTerm);
  }

  function matchesStatus(item) {
  const st = apStatus(item);

  if (selectedStatus === "all") return true;
  if (selectedStatus === "open") return st !== "paid";
  if (selectedStatus === "soon7") {
    if (st === "paid" || st === "late") return false;

    const due = parseISODate(item.dueDate);
    if (!due) return false;

    const d = diffDays(todayStart(), due);
    return d >= 0 && d <= 7;
  }

  return st === selectedStatus;
}

  function matchesCategory(item) {
    if (selectedCategories.size === 0) return true;
    return selectedCategories.has(String(item.category || "").trim());
  }

  function matchesPeriod(item) {
  const due = parseISODate(item.dueDate);
  if (!due) return false;

  if (periodMode === "all") return true;

  if (periodMode === "day" && selectedISO) {
    return item.dueDate === selectedISO;
  }

  if (periodMode === "range" && rangeStart && rangeEnd) {
    return item.dueDate >= rangeStart && item.dueDate <= rangeEnd;
  }

  if (periodMode === "custom") {
    const okMonth = selectedMonthFilter === null || due.getMonth() === selectedMonthFilter;
    const okYear = selectedYearFilter === null || due.getFullYear() === selectedYearFilter;
    return okMonth && okYear;
  }

  const { s, e } = monthRange(calYear, calMonth);
  return due >= s && due <= e;
}

  function getFiltered(all) {
    return all.filter(x =>
      matchesSearch(x) &&
      matchesStatus(x) &&
      matchesCategory(x) &&
      matchesPeriod(x)
    );
  }

  function sortAccounts(a, b) {
    const today = todayStart();
    const da = parseISODate(a.dueDate);
    const db = parseISODate(b.dueDate);

    const sa = apStatus(a);
    const sb = apStatus(b);

    if (sa === "late" && sb !== "late") return -1;
    if (sb === "late" && sa !== "late") return 1;
    if (sa === "today" && sb !== "today") return -1;
    if (sb === "today" && sa !== "today") return 1;

    const aPast = da && da.getTime() <= today.getTime();
    const bPast = db && db.getTime() <= today.getTime();

    if (aPast !== bPast) return aPast ? -1 : 1;
    if (aPast && bPast) return (db?.getTime() || 0) - (da?.getTime() || 0);

    return (da?.getTime() || 0) - (db?.getTime() || 0);
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[;\n"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadCSV(filename, headers, rows) {
    const sep = ";";
    const lines = [
      headers.map(csvEscape).join(sep),
      ...rows.map(r => r.map(csvEscape).join(sep))
    ];

    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

 function dateBR(iso) {
  if (!iso) return "";
  return String(iso).split("-").reverse().join("/");
}

function statusText(item) {
  const st = apStatus(item);
  if (st === "paid") return "Paga";
  if (st === "late") return "Atrasada";
  if (st === "today") return "Vence hoje";
  return "Pendente";
}

function methodText(method) {
  const map = {
    pix: "Pix",
    cash: "Dinheiro",
    boleto: "Boleto",
    card: "Cartão",
    transfer: "Transferência"
  };

  return map[method] || method || "";
}

function getReportPeriodLabel() {
  if (periodMode === "all") return "Todas as contas";

  if (periodMode === "day" && selectedISO) {
    return `Dia ${dateBR(selectedISO)}`;
  }

  if (periodMode === "range" && rangeStart && rangeEnd) {
    return `${dateBR(rangeStart)} até ${dateBR(rangeEnd)}`;
  }

  if (periodMode === "custom") {
    const meses = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    const parts = [];

    if (selectedMonthFilter !== null) parts.push(meses[selectedMonthFilter]);
    if (selectedYearFilter !== null) parts.push(String(selectedYearFilter));

    return parts.length ? parts.join(" / ") : "Filtro personalizado";
  }

  return formatMonthTitle(calYear, calMonth);
}

function getReportFiltersLabel() {
  const filters = [];

  if (searchTerm) filters.push(`Busca: ${searchTerm}`);

  if (selectedStatus !== "all") {
    filters.push(`Status: ${STATUS_LABELS[selectedStatus] || selectedStatus}`);
  }

  if (selectedCategories.size) {
    filters.push(`Categorias: ${[...selectedCategories].join(", ")}`);
  }

  filters.push(`Período: ${getReportPeriodLabel()}`);

  return filters;
}

function getReportLogoHTML() {
  const img =
    document.querySelector(".topbar img") ||
    document.querySelector(".brand img") ||
    document.querySelector("img[alt*='Clube']") ||
    document.querySelector("img[src*='clube']");

  if (img?.src) {
    return `<img class="report-logo" src="${esc(img.src)}" alt="Logo">`;
  }

  return `<div class="report-logo-fallback">CLUBE<br><span>DO SUPLEMENTO</span></div>`;
}

function buildCategorySummary(list) {
  const map = new Map();

  list.forEach(item => {
    const cat = String(item.category || "Sem categoria").trim() || "Sem categoria";
    const current = map.get(cat) || {
      count: 0,
      total: 0,
      open: 0,
      paid: 0,
      late: 0
    };

    const amount = Number(item.amount || 0);
    const st = apStatus(item);

    current.count += 1;
    current.total += amount;

    if (st === "paid") current.paid += amount;
    else current.open += amount;

    if (st === "late") current.late += amount;

    map.set(cat, current);
  });

  return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
}

function buildProfessionalCSVContent(list) {
  const sorted = list.slice().sort(sortAccounts);
  const pending = sorted.filter(x => apStatus(x) !== "paid");
  const paid = sorted.filter(x => apStatus(x) === "paid");
  const late = sorted.filter(x => apStatus(x) === "late");

  const sep = ";";
  const q = (v) => csvEscape(v);

  const lines = [];

  lines.push(["RELATÓRIO DE CONTAS A PAGAR"].map(q).join(sep));
  lines.push(["Empresa", "Clube do Suplemento"].map(q).join(sep));
  lines.push(["Gerado em", new Date().toLocaleString("pt-BR")].map(q).join(sep));
  lines.push(["Período", getReportPeriodLabel()].map(q).join(sep));
  lines.push("");

  lines.push(["FILTROS UTILIZADOS"].map(q).join(sep));
  getReportFiltersLabel().forEach(f => {
    lines.push([f].map(q).join(sep));
  });
  lines.push("");

  lines.push(["RESUMO GERAL"].map(q).join(sep));
  lines.push(["Quantidade de contas", sorted.length].map(q).join(sep));
  lines.push(["Total geral", sum(sorted).toFixed(2)].map(q).join(sep));
  lines.push(["Total em aberto", sum(pending).toFixed(2)].map(q).join(sep));
  lines.push(["Total pago", sum(paid).toFixed(2)].map(q).join(sep));
  lines.push(["Total atrasado", sum(late).toFixed(2)].map(q).join(sep));
  lines.push("");

  lines.push(["RESUMO POR CATEGORIA"].map(q).join(sep));
  lines.push(["Categoria", "Qtd", "Total", "Em aberto", "Pago", "Atrasado"].map(q).join(sep));

  buildCategorySummary(sorted).forEach(([cat, data]) => {
    lines.push([
      cat,
      data.count,
      data.total.toFixed(2),
      data.open.toFixed(2),
      data.paid.toFixed(2),
      data.late.toFixed(2)
    ].map(q).join(sep));
  });

  lines.push("");

  lines.push(["LANÇAMENTOS DETALHADOS"].map(q).join(sep));
  lines.push([
    "Status",
    "Vencimento",
    "Descrição",
    "Categoria",
    "Fornecedor",
    "Valor",
    "Forma de pagamento",
    "Pago em",
    "Observações"
  ].map(q).join(sep));

  sorted.forEach(x => {
    lines.push([
      statusText(x),
      dateBR(x.dueDate),
      x.title || "",
      x.category || "",
      x.supplier || "",
      Number(x.amount || 0).toFixed(2),
      methodText(x.paidMethod),
      x.paidAt ? new Date(x.paidAt).toLocaleString("pt-BR") : "",
      x.notes || ""
    ].map(q).join(sep));
  });

  return "\uFEFF" + lines.join("\n");
}

function downloadProfessionalCSV(filename, list) {
  const blob = new Blob([buildProfessionalCSVContent(list)], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function openProfessionalPDF(list) {
  const sorted = list.slice().sort(sortAccounts);

  const pending = sorted.filter(x => apStatus(x) !== "paid");
  const paid = sorted.filter(x => apStatus(x) === "paid");
  const late = sorted.filter(x => apStatus(x) === "late");

  const categories = buildCategorySummary(sorted);
  const generatedAt = new Date().toLocaleString("pt-BR");

  const rowsHTML = sorted.map(x => {
    const st = apStatus(x);

    return `
      <tr>
        <td><span class="status ${st}">${esc(statusText(x))}</span></td>
        <td>${esc(dateBR(x.dueDate))}</td>
        <td>
          <strong>${esc(x.title || "")}</strong>
          ${x.notes ? `<div class="muted">${esc(x.notes)}</div>` : ""}
        </td>
        <td>${esc(x.category || "Sem categoria")}</td>
        <td>${esc(x.supplier || "")}</td>
        <td class="money">${moneyBR(x.amount)}</td>
        <td>${esc(methodText(x.paidMethod))}</td>
      </tr>
    `;
  }).join("");

  const categoryHTML = categories.map(([cat, data]) => `
    <tr>
      <td><strong>${esc(cat)}</strong></td>
      <td>${data.count}</td>
      <td class="money">${moneyBR(data.total)}</td>
      <td class="money">${moneyBR(data.open)}</td>
      <td class="money">${moneyBR(data.paid)}</td>
      <td class="money">${moneyBR(data.late)}</td>
    </tr>
  `).join("");

  const html = `
    <html>
      <head>
        <title>Relatório de Contas a Pagar</title>
        <style>
          *{box-sizing:border-box;}
          body{
            font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
            color:#0f172a;
            margin:0;
            padding:28px;
            background:#fff;
          }

          .header{
            display:flex;
            justify-content:space-between;
            align-items:flex-start;
            gap:24px;
            border-bottom:3px solid #0f172a;
            padding-bottom:18px;
            margin-bottom:18px;
          }

          .eyebrow{
            font-size:11px;
            font-weight:900;
            color:#64748b;
            letter-spacing:.08em;
            text-transform:uppercase;
            margin-bottom:6px;
          }

          h1{
            font-size:26px;
            line-height:1;
            margin:0;
            letter-spacing:-.6px;
          }

          .subtitle{
            margin-top:8px;
            font-size:12px;
            color:#475569;
            font-weight:700;
          }

          .report-logo{
            max-width:150px;
            max-height:58px;
            object-fit:contain;
          }

          .report-logo-fallback{
            border:2px solid #f97316;
            color:#f97316;
            border-radius:14px;
            padding:8px 12px;
            font-weight:950;
            text-align:center;
            line-height:1;
            font-size:18px;
          }

          .report-logo-fallback span{
            font-size:9px;
            color:#0f172a;
          }

          .meta-grid{
            display:grid;
            grid-template-columns:repeat(4,1fr);
            gap:10px;
            margin:18px 0;
          }

          .card{
            border:1px solid #e2e8f0;
            border-radius:16px;
            padding:12px;
            background:#f8fafc;
          }

          .card .label{
            font-size:10px;
            color:#64748b;
            text-transform:uppercase;
            letter-spacing:.04em;
            font-weight:950;
          }

          .card .value{
            margin-top:6px;
            font-size:18px;
            font-weight:950;
          }

          .filters{
            border:1px solid #e2e8f0;
            border-radius:16px;
            padding:12px;
            margin-bottom:18px;
          }

          .filters-title{
            font-size:12px;
            font-weight:950;
            color:#334155;
            margin-bottom:8px;
          }

          .chip{
            display:inline-block;
            padding:6px 9px;
            border-radius:999px;
            background:#eff6ff;
            color:#1d4ed8;
            font-size:11px;
            font-weight:850;
            margin:0 5px 6px 0;
          }

          h2{
            margin:22px 0 10px;
            font-size:15px;
            letter-spacing:-.2px;
          }

          table{
            width:100%;
            border-collapse:separate;
            border-spacing:0;
            font-size:11px;
            overflow:hidden;
            border:1px solid #e2e8f0;
            border-radius:14px;
          }

          th{
            background:#0f172a;
            color:#fff;
            text-align:left;
            padding:9px;
            font-size:10px;
            text-transform:uppercase;
            letter-spacing:.04em;
          }

          td{
            padding:9px;
            border-top:1px solid #e2e8f0;
            vertical-align:top;
          }

          tr:nth-child(even) td{
            background:#f8fafc;
          }

          .money{
            text-align:right;
            white-space:nowrap;
            font-weight:900;
          }

          .muted{
            color:#64748b;
            font-size:10px;
            margin-top:3px;
          }

          .status{
            display:inline-block;
            padding:4px 7px;
            border-radius:999px;
            font-size:10px;
            font-weight:950;
            white-space:nowrap;
          }

          .status.late{background:#fee2e2;color:#991b1b;}
          .status.today{background:#ffedd5;color:#9a3412;}
          .status.pending{background:#fef9c3;color:#854d0e;}
          .status.paid{background:#dcfce7;color:#166534;}

          .footer{
            margin-top:22px;
            font-size:10px;
            color:#64748b;
            display:flex;
            justify-content:space-between;
            border-top:1px solid #e2e8f0;
            padding-top:10px;
          }

          @media print{
            body{padding:18px;}
            .no-break{break-inside:avoid;}
            table{page-break-inside:auto;}
            tr{page-break-inside:avoid; page-break-after:auto;}
          }
        </style>
      </head>

      <body>
        <div class="header">
          <div>
            <div class="eyebrow">Relatório financeiro</div>
            <h1>Contas a Pagar</h1>
            <div class="subtitle">Clube do Suplemento • Gerado em ${esc(generatedAt)}</div>
          </div>

          ${getReportLogoHTML()}
        </div>

        <div class="meta-grid no-break">
          <div class="card">
            <div class="label">Total do relatório</div>
            <div class="value">${moneyBR(sum(sorted))}</div>
          </div>

          <div class="card">
            <div class="label">Em aberto</div>
            <div class="value">${moneyBR(sum(pending))}</div>
          </div>

          <div class="card">
            <div class="label">Pago</div>
            <div class="value">${moneyBR(sum(paid))}</div>
          </div>

          <div class="card">
            <div class="label">Atrasado</div>
            <div class="value">${moneyBR(sum(late))}</div>
          </div>
        </div>

        <div class="filters no-break">
          <div class="filters-title">Filtros utilizados</div>
          ${getReportFiltersLabel().map(f => `<span class="chip">${esc(f)}</span>`).join("")}
          <span class="chip">${sorted.length} conta(s)</span>
        </div>

        <h2>Resumo por categoria</h2>
        <table class="no-break">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Qtd</th>
              <th>Total</th>
              <th>Em aberto</th>
              <th>Pago</th>
              <th>Atrasado</th>
            </tr>
          </thead>
          <tbody>
            ${categoryHTML || `<tr><td colspan="6">Nenhuma categoria encontrada.</td></tr>`}
          </tbody>
        </table>

        <h2>Lançamentos detalhados</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Vencimento</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Fornecedor</th>
              <th>Valor</th>
              <th>Forma</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML || `<tr><td colspan="7">Nenhuma conta encontrada para os filtros atuais.</td></tr>`}
          </tbody>
        </table>

        <div class="footer">
          <span>Relatório gerado pelo Catrion Core</span>
          <span>Documento para apoio contábil</span>
        </div>

        <script>
          window.onload = () => setTimeout(() => window.print(), 250);
        </script>
      </body>
    </html>
  `;

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

  function buildExportRows(list) {
    const headers = ["Status", "Vencimento", "Descrição", "Categoria", "Fornecedor", "Valor", "Pago em", "Forma", "Obs"];

    const rows = list.map(x => {
      const st = apStatus(x);
      const paidAt = x.paidAt ? new Date(x.paidAt).toLocaleString("pt-BR") : "";

      return [
        st,
        x.dueDate || "",
        x.title || "",
        x.category || "",
        x.supplier || "",
        Number(x.amount || 0).toFixed(2),
        paidAt,
        x.paidMethod || "",
        x.notes || ""
      ];
    });

    return { headers, rows };
  }

  function renderBase() {
  content.innerHTML = `
    <div class="ap-shell">

      <div class="ap-top-grid">
        <div class="ap-kpis-grid ap-kpis-compact">
          <button class="ap-kpi-card ap-kpi-click ap-kpi-open main" data-status="open" type="button">
            <div class="k">Total em aberto</div>
            <div class="v" id="kTotalOpen">—</div>
            <div class="m" id="kTotalOpenSub">Todas as contas não pagas</div>
          </button>

          <button class="ap-kpi-card ap-kpi-click warn" data-status="today" type="button">
            <div class="k">Vence hoje</div>
            <div class="v" id="kToday">—</div>
            <div class="m">Prioridade máxima do dia</div>
          </button>

          <button class="ap-kpi-card ap-kpi-click soon" data-status="soon7" type="button">
            <div class="k">Próximos 7 dias</div>
            <div class="v" id="kSoon">—</div>
            <div class="m">Contas próximas do vencimento</div>
          </button>

          <button class="ap-kpi-card ap-kpi-click danger" data-status="late" type="button">
            <div class="k">Atrasadas</div>
            <div class="v" id="kLate">—</div>
            <div class="m">Precisam de ação imediata</div>
          </button>

          <button class="ap-kpi-card ap-kpi-click ok" data-status="paid" type="button">
            <div class="k">Pagas no período</div>
            <div class="v" id="kPaid">—</div>
            <div class="m">Valor quitado no recorte atual</div>
          </button>
        </div>

        <div class="ap-calendar-zone">
  <div class="ap-calendar-top">
    <div class="ap-cal-head">
      <button class="r-btn ap-cal-nav" id="apCalPrev">‹</button>
      <div class="ap-cal-title" id="apCalTitle">—</div>
      <button class="r-btn ap-cal-nav" id="apCalNext">›</button>
    </div>

    <div class="ap-cal-week">
      <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
    </div>

    <div class="ap-cal-grid" id="apCalGrid"></div>

    <div class="ap-cal-foot">
      <div class="ap-cal-hint" id="apCalHint">—</div>
    </div>
    </div>

      </div>
      </div>

  <div class="ap-filter-panel ap-filter-panel-new">
  <div class="ap-filter-layout-v3">

    <div class="ap-filter-search-area">
      <input id="apSearch" class="ap-search" placeholder="Buscar por descrição, fornecedor ou observação...">
    </div>

    <div class="ap-filter-status-area">
      <select id="apStatusFilter" class="ap-select">
        <option value="all">Todos os status</option>
        <option value="open">Em aberto</option>
        <option value="pending">Pendentes</option>
        <option value="today">Vence hoje</option>
        <option value="soon7">Próximos 7 dias</option>
        <option value="late">Atrasadas</option>
        <option value="paid">Pagas</option>
      </select>
    </div>

    <div class="ap-filter-category-area">
      <div class="ap-multi-filter">
        <button class="r-btn ap-cat-btn" id="apCatBtn" type="button">
          <span id="apCatBtnLabel">Categorias</span>
          <span>▾</span>
        </button>
        <div id="apCatDropdown" class="ap-cat-dropdown hidden"></div>
      </div>
    </div>

    <div class="ap-filter-chip-area">
      <div class="ap-selected-cats" id="apSelectedCats"></div>
    </div>

    <div class="ap-filter-period-area">
      <select class="r-btn small ap-cal-select" id="apCalMonthSelect">
        <option value="">Mês</option>
        <option value="0">Janeiro</option>
        <option value="1">Fevereiro</option>
        <option value="2">Março</option>
        <option value="3">Abril</option>
        <option value="4">Maio</option>
        <option value="5">Junho</option>
        <option value="6">Julho</option>
        <option value="7">Agosto</option>
        <option value="8">Setembro</option>
        <option value="9">Outubro</option>
        <option value="10">Novembro</option>
        <option value="11">Dezembro</option>
      </select>

      <select class="r-btn small ap-cal-select" id="apCalYearSelect">
        <option value="">Ano</option>
        <option value="2025">2025</option>
        <option value="2026">2026</option>
        <option value="2027">2027</option>
        <option value="2028">2028</option>
        <option value="2029">2029</option>
        <option value="2030">2030</option>
      </select>
    </div>

    <div class="ap-filter-action-area">
      <button class="r-btn small" id="apCalToday">Hoje</button>
      <button class="r-btn small ap-clear-btn" id="apCalClear">Limpar</button>
    </div>

  </div>

  <div style="display:none">
    <div class="ap-period-title" id="apPeriodTitle">—</div>
    <div class="ap-period-sub" id="apPeriodSub">—</div>
  </div>
</div>

      <div class="ap-panel">
        <div class="ap-panel-head">
          <div>
            <div class="ap-panel-title">Lista de contas</div>
            <div class="ap-panel-sub" id="apListSub">Clique numa categoria para abrir.</div>
          </div>
        </div>

        <div class="ap-panel-body">
          <div class="ap-list-summary ap-list-summary-one">
  <div class="ap-summary-card">
    <div class="ap-summary-label">Total no filtro</div>
    <div class="ap-summary-value" id="apSummaryPending">—</div>
    <div class="ap-summary-note"><span id="apSummaryCount">—</span> conta(s) exibida(s)</div>
  </div>
</div>

          <div class="ap-list-grid" id="apList"></div>
          <div class="ap-list-footer" id="apListFooter"></div>
        </div>
      </div>

    </div>
  `;
}

  function renderCategoryDropdown(all) {
    const dropdown = document.getElementById("apCatDropdown");
    const label = document.getElementById("apCatBtnLabel");

    const cats = getCategoryNames(all);

    label.textContent = selectedCategories.size
      ? `Categorias (${selectedCategories.size})`
      : "Categorias";

    dropdown.innerHTML = `
      <div class="ap-cat-drop-head">
        <div class="ap-cat-drop-title">Filtrar categorias</div>
        <button class="r-btn small" id="apCatClear" type="button">Limpar</button>
      </div>

      ${cats.length ? cats.map(cat => `
        <label class="ap-cat-item">
          <input type="checkbox" value="${esc(cat)}" ${selectedCategories.has(cat) ? "checked" : ""}>
          <span>${esc(cat)}</span>
        </label>
      `).join("") : `<div class="ap-empty">Nenhuma categoria encontrada.</div>`}
    `;

    dropdown.querySelectorAll("input[type='checkbox']").forEach(chk => {
      chk.addEventListener("change", () => {
        if (chk.checked) selectedCategories.add(chk.value);
        else selectedCategories.delete(chk.value);
        draw();
      });
    });

    document.getElementById("apCatClear")?.addEventListener("click", () => {
      selectedCategories.clear();
      draw();
    });
  }

  function renderSelectedChips() {
    const el = document.getElementById("apSelectedCats");
    const selected = [...selectedCategories];

    const chips = [];

    if (searchTerm) {
      chips.push(`
        <button class="ap-selected-chip" data-kind="search" type="button">
          Busca: ${esc(searchTerm)} <span>×</span>
        </button>
      `);
    }

    if (selectedStatus !== "all") {
      const label = STATUS_LABELS[selectedStatus] || selectedStatus;

      chips.push(`
        <button class="ap-selected-chip" data-kind="status" type="button">
          Status: ${esc(label)} <span>×</span>
        </button>
      `);
    }

    selected.forEach(cat => {
      chips.push(`
        <button class="ap-selected-chip" data-kind="cat" data-cat="${esc(cat)}" type="button">
          ${esc(cat)} <span>×</span>
        </button>
      `);
    });

    if (periodMode === "day" && selectedISO) {
      chips.push(`
        <button class="ap-selected-chip" data-kind="day" type="button">
          Dia: ${selectedISO.split("-").reverse().join("/")} <span>×</span>
        </button>
      `);
    }

    if (periodMode === "range" && rangeStart && rangeEnd) {
  chips.push(`
    <button class="ap-selected-chip" data-kind="range" type="button">
      Período: ${rangeStart.split("-").reverse().join("/")} até ${rangeEnd.split("-").reverse().join("/")} <span>×</span>
    </button>
  `);
}

if (periodMode === "custom" && selectedMonthFilter !== null) {
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  chips.push(`
    <button class="ap-selected-chip" data-kind="month" type="button">
      Mês: ${meses[selectedMonthFilter]} <span>×</span>
    </button>
  `);
}

if (periodMode === "custom" && selectedYearFilter !== null) {
  chips.push(`
    <button class="ap-selected-chip" data-kind="year" type="button">
      Ano: ${selectedYearFilter} <span>×</span>
    </button>
  `);
}

    el.innerHTML = chips.join("");

    el.querySelectorAll(".ap-selected-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const kind = btn.getAttribute("data-kind");

        if (kind === "search") {
          searchTerm = "";
          document.getElementById("apSearch").value = "";
        }

        if (kind === "status") {
          selectedStatus = "all";
          document.getElementById("apStatusFilter").value = "all";
        }

        if (kind === "cat") {
          selectedCategories.delete(btn.getAttribute("data-cat"));
        }

        if (kind === "day") {
  selectedISO = "";
  periodMode = "all";
}

if (kind === "range") {
  rangeStart = "";
  rangeEnd = "";
  periodMode = "all";
}

if (kind === "month") {
  selectedMonthFilter = null;
  document.getElementById("apCalMonthSelect").value = "";

  if (selectedYearFilter !== null) periodMode = "custom";
  else periodMode = "all";
}

if (kind === "year") {
  selectedYearFilter = null;
  document.getElementById("apCalYearSelect").value = "";

  if (selectedMonthFilter !== null) periodMode = "custom";
  else periodMode = "all";
}

        draw();
      });
    });
  }

  function renderKPIs(all, filtered) {
  const allOpen = all.filter(x => apStatus(x) !== "paid");
  const late = all.filter(x => apStatus(x) === "late");
  const todayList = all.filter(x => apStatus(x) === "today");

  const today = todayStart();

  const soon7 = all.filter(x => {
    const st = apStatus(x);
    if (st === "paid" || st === "late") return false;

    const due = parseISODate(x.dueDate);
    if (!due) return false;

    const d = diffDays(today, due);
    return d >= 0 && d <= 7;
  });

  const paid = filtered.filter(x => apStatus(x) === "paid");

  document.getElementById("kTotalOpen").textContent = moneyBR(sum(allOpen));
  document.getElementById("kTotalOpenSub").textContent = `${allOpen.length} conta(s) abertas no geral`;

  document.getElementById("kLate").textContent = moneyBR(sum(late));
  document.getElementById("kToday").textContent = moneyBR(sum(todayList));
  document.getElementById("kSoon").textContent = moneyBR(sum(soon7));
  document.getElementById("kPaid").textContent = moneyBR(sum(paid));

  document.querySelectorAll(".ap-kpi-click").forEach(card => {
    card.classList.toggle("active", selectedStatus === card.getAttribute("data-status"));
  });
}

  function renderPeriodInfo(filtered) {
    const title = document.getElementById("apPeriodTitle");
    const sub = document.getElementById("apPeriodSub");

    if (periodMode === "all") {
      title.textContent = "Todas as contas";
      sub.textContent = `${filtered.length} conta(s) no recorte geral`;
      return;
    }

    if (periodMode === "day" && selectedISO) {
      title.textContent = `Dia ${selectedISO.split("-").reverse().join("/")}`;
      sub.textContent = `${filtered.length} conta(s) nesse dia`;
      return;
    }

    if (periodMode === "range" && rangeStart && rangeEnd) {
  title.textContent = `Período`;
  sub.textContent = `${rangeStart.split("-").reverse().join("/")} até ${rangeEnd.split("-").reverse().join("/")} • ${filtered.length} conta(s)`;
  return;
}

    title.textContent = formatMonthTitle(calYear, calMonth);
    sub.textContent = `${filtered.length} conta(s) no mês exibido`;
  }

  function renderBreakdownByCategory(filtered) {
    const el = document.getElementById("apByCategory");

    const map = new Map();

    filtered.forEach(x => {
      const cat = String(x.category || "Sem categoria").trim();
      const current = map.get(cat) || { total: 0, count: 0, pending: 0, paid: 0 };

      current.total += Number(x.amount || 0);
      current.count += 1;

      if (apStatus(x) === "paid") current.paid += Number(x.amount || 0);
      else current.pending += Number(x.amount || 0);

      map.set(cat, current);
    });

    const rows = [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total);

    const max = rows[0]?.[1]?.total || 0;


    el.innerHTML = rows.length ? rows.slice(0, 10).map(([cat, data]) => {
      const pct = max ? Math.max(4, Math.round((data.total / max) * 100)) : 0;

      return `
        <div class="ap-breakdown-row">
          <div class="ap-breakdown-top">
            <div>
              <div class="ap-breakdown-name">${esc(cat)}</div>
              <div class="ap-breakdown-meta">${data.count} conta(s) • Pendente: ${moneyBR(data.pending)}</div>
            </div>
            <div class="ap-breakdown-value">${moneyBR(data.total)}</div>
          </div>
          <div class="ap-bar"><span style="width:${pct}%"></span></div>
        </div>
      `;
    }).join("") : `<div class="ap-empty">Nenhuma categoria encontrada para o filtro atual.</div>`;
  }

  function renderBreakdownByMonth(all) {
    const el = document.getElementById("apByMonth");

   const base = all.filter(x =>
  matchesSearch(x) &&
  matchesCategory(x)
);

    const map = new Map();

    base.forEach(x => {
      if (!x.dueDate) return;

      const key = String(x.dueDate).slice(0, 7);
      const current = map.get(key) || { total: 0, count: 0, pending: 0, paid: 0 };

      current.total += Number(x.amount || 0);
      current.count += 1;

      if (apStatus(x) === "paid") current.paid += Number(x.amount || 0);
      else current.pending += Number(x.amount || 0);

      map.set(key, current);
    });

    const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const max = rows.reduce((acc, [, data]) => Math.max(acc, data.total), 0);

    document.getElementById("apMonthSummary").textContent = rows.length
      ? `${rows.length} mês(es)`
      : "Sem dados";

    el.innerHTML = rows.length ? rows.slice(0, 12).map(([key, data]) => {
      const [y, m] = key.split("-").map(Number);
      const label = formatMonthTitle(y, m - 1);
      const pct = max ? Math.max(4, Math.round((data.total / max) * 100)) : 0;

      return `
        <div class="ap-breakdown-row">
          <div class="ap-breakdown-top">
            <div>
              <div class="ap-breakdown-name">${esc(label)}</div>
              <div class="ap-breakdown-meta">${data.count} conta(s) • Aberto: ${moneyBR(data.pending)}</div>
            </div>
            <div class="ap-breakdown-value">${moneyBR(data.total)}</div>
          </div>
          <div class="ap-bar"><span style="width:${pct}%"></span></div>
        </div>
      `;
    }).join("") : `<div class="ap-empty">Nenhum mês encontrado para os filtros atuais.</div>`;
  }

  function renderAlerts(filtered) {
    const el = document.getElementById("apAlerts");
    const today = todayStart();

    const alerts = filtered
      .filter(x => {
        const st = apStatus(x);
        if (st === "late" || st === "today") return true;

        const due = parseISODate(x.dueDate);
        if (!due) return false;

        const d = diffDays(today, due);
        return d >= 0 && d <= 7;
      })
      .sort(sortAccounts)
      .slice(0, 6);

    el.innerHTML = alerts.length ? alerts.map(x => {
      const st = apStatus(x);
      const due = parseISODate(x.dueDate);
      const d = due ? diffDays(today, due) : 0;

      const hint =
        st === "late" ? `Atrasada (${Math.abs(d)}d)` :
        st === "today" ? "Vence hoje" :
        `Vence em ${d}d`;

      return `
        <div class="ap-alert-card ${st}">
          <div class="ap-alert-top">
            <div class="ap-alert-title">${esc(x.title)}</div>
            ${apBadge(st)}
          </div>
          <div class="ap-alert-meta">
            <span>${hint}</span>
            <span>Venc: <b>${esc(String(x.dueDate || "").split("-").reverse().join("/"))}</b></span>
            <span>Valor: <b>${moneyBR(x.amount)}</b></span>
            ${x.category ? `<span>Cat: <b>${esc(x.category)}</b></span>` : ""}
            ${x.supplier ? `<span>Fornecedor: <b>${esc(x.supplier)}</b></span>` : ""}
          </div>
        </div>
      `;
    }).join("") : `<div class="ap-empty">Sem alertas para os filtros atuais.</div>`;
  }

  function renderList(filtered) {
  const el = document.getElementById("apList");
  const footer = document.getElementById("apListFooter");
  const sub = document.getElementById("apListSub");

  const list = filtered.slice().sort(sortAccounts);

  const groups = new Map();

  list.forEach(item => {
    const cat = String(item.category || "Sem categoria").trim() || "Sem categoria";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  });

  const groupRows = [...groups.entries()]
    .map(([cat, items]) => {
      const total = sum(items);
      const pending = sum(items.filter(x => apStatus(x) !== "paid"));
      const paid = sum(items.filter(x => apStatus(x) === "paid"));
      const lateCount = items.filter(x => apStatus(x) === "late").length;
      const todayCount = items.filter(x => apStatus(x) === "today").length;

      let mood = "pending";
      if (lateCount > 0) mood = "late";
      else if (todayCount > 0) mood = "today";
      else if (pending <= 0 && paid > 0) mood = "paid";

      return { cat, items, total, pending, paid, lateCount, todayCount, mood };
    })
    .sort((a, b) => b.pending - a.pending);

  const visibleGroups = groupRows.slice(0, listLimit);

  sub.textContent = `${list.length} conta(s) em ${groupRows.length} categoria(s). Clique numa categoria para abrir.`;

  el.innerHTML = visibleGroups.length ? visibleGroups.map(group => {
    const key = encodeURIComponent(group.cat);
    const isOpen = expandedCategories.has(group.cat);
    const segments = group.items.map(x => {
  const st = apStatus(x);

  if (st === "paid") return "paid";
  if (st === "late") return "late";
  if (st === "today") return "today";

  const due = parseISODate(x.dueDate);
  const d = due ? diffDays(todayStart(), due) : 99;

  if (d >= 0 && d <= 7) return "soon";
  return "pending";
});

    return `
      <div class="ap-cat-group ${group.mood}">
        <button class="ap-cat-group-head" type="button" data-cat="${key}">
          <div class="ap-cat-group-main">
            <div class="ap-cat-group-title">
              <span class="ap-cat-chevron">${isOpen ? "▾" : "▸"}</span>
              ${esc(group.cat)}
            </div>

            <div class="ap-cat-group-meta">
              ${group.items.length} conta(s)
              ${group.lateCount ? `• ${group.lateCount} atrasada(s)` : ""}
              ${group.todayCount ? `• ${group.todayCount} vence(m) hoje` : ""}
              • Aberto: ${moneyBR(group.pending)}
            </div>
          </div>

          <div class="ap-cat-group-value">${moneyBR(group.total)}</div>
        </button>

        <div class="ap-status-segments ap-status-segments-list">
  ${segments.map(st => `<span class="ap-status-segment ${st}"></span>`).join("")}
</div>

        ${isOpen ? `
          <div class="ap-cat-group-items">
            ${group.items.map(x => {
              const st = apStatus(x);
              const checked = st === "paid" ? "checked" : "";

              return `
                <div class="ap-row ap-item ${st}" data-id="${esc(x.id)}">
                  <div class="ap-row-main">
                    <div class="ap-row-top">
                      <div class="ap-row-title">${esc(x.title)}</div>
                      ${apBadge(st)}
                    </div>

                    <div class="ap-row-meta">
                      <span>Venc: <b>${esc(String(x.dueDate || "").split("-").reverse().join("/"))}</b></span>
                      ${x.supplier ? `<span>Fornecedor: <b>${esc(x.supplier)}</b></span>` : ""}
                      ${x.notes ? `<span>Obs: <b>${esc(x.notes)}</b></span>` : ""}
                    </div>

                    <div class="ap-mini-status-bar ap-mini-${st}"></div>
                  </div>

                  <div class="ap-row-actions">
                    <div class="ap-row-value">${moneyBR(x.amount)}</div>

                    <label class="ap-paid-wrap">
                      <input type="checkbox" class="ap-paid-toggle ap-check" data-id="${esc(x.id)}" ${checked}>
                      Pago
                    </label>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }).join("") : `<div class="ap-empty">Nenhuma conta encontrada para os filtros atuais.</div>`;

  el.querySelectorAll(".ap-cat-group-head").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = decodeURIComponent(btn.getAttribute("data-cat") || "");

      if (expandedCategories.has(cat)) expandedCategories.delete(cat);
      else expandedCategories.add(cat);

      draw();
    });
  });

  el.querySelectorAll(".ap-item").forEach(row => {
    row.addEventListener("click", (ev) => {
      if (ev.target?.classList?.contains("ap-paid-toggle") || ev.target?.closest?.("label")) return;

      const id = row.getAttribute("data-id");
      const item = apPayablesCache.find(x => String(x.id) === String(id));
      if (!item) return;

      openCreateModal(item, { viewOnly: true });
    });
  });

  el.querySelectorAll(".ap-paid-toggle").forEach(chk => {
    chk.addEventListener("change", async () => {
      const id = chk.getAttribute("data-id");
      await setPaid(id, chk.checked);
    });
  });

  footer.innerHTML = groupRows.length > visibleGroups.length
    ? `<button class="r-btn" id="apShowMore" type="button">Ver mais categorias</button>`
    : "";

  document.getElementById("apShowMore")?.addEventListener("click", () => {
    listLimit += 12;
    draw();
  });
}

  function renderCalendar(all) {
    const title = document.getElementById("apCalTitle");
    const grid = document.getElementById("apCalGrid");
    const hint = document.getElementById("apCalHint");

   title.textContent = formatMonthTitle(calYear, calMonth);

    const monthSelect = document.getElementById("apCalMonthSelect");
const yearSelect = document.getElementById("apCalYearSelect");

if (monthSelect) {
  monthSelect.value = selectedMonthFilter === null ? "" : String(selectedMonthFilter);
}

if (yearSelect) {
  yearSelect.value = selectedYearFilter === null ? "" : String(selectedYearFilter);
}

    const { s, e } = monthRange(calYear, calMonth);
    const firstDay = new Date(calYear, calMonth, 1, 0, 0, 0, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    const base = all.filter(x =>
  matchesSearch(x) &&
  matchesCategory(x)
);

    const dueMap = new Map();

    base.forEach(x => {
      const due = parseISODate(x.dueDate);
      if (!due) return;
      if (due.getTime() < s.getTime() || due.getTime() > e.getTime()) return;

      const key = x.dueDate;
      dueMap.set(key, (dueMap.get(key) || 0) + 1);
    });

    const todayISO = toISODate(new Date());

    grid.innerHTML = "";

    for (let i = 0; i < startWeekday; i++) {
      const div = document.createElement("div");
      div.className = "ap-cal-cell empty";
      grid.appendChild(div);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const count = dueMap.get(iso) || 0;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ap-cal-cell";

      if (iso === todayISO) cell.classList.add("today");
      if (count > 0) cell.classList.add("hasDue");
      if (periodMode === "day" && selectedISO === iso) cell.classList.add("selected");

      if (periodMode === "range" && rangeStart && rangeEnd && iso >= rangeStart && iso <= rangeEnd) {
  cell.classList.add("in-range");
}

if (periodMode === "range" && rangeStart && !rangeEnd && iso === rangeStart) {
  cell.classList.add("selected");
}

      cell.innerHTML = `
        <span class="d">${day}</span>
        <span class="dot">${count || ""}</span>
      `;

      cell.onclick = () => {
        selectedStatus = "all";
document.getElementById("apStatusFilter").value = "all";

selectedMonthFilter = null;
selectedYearFilter = null;
document.getElementById("apCalMonthSelect").value = "";
document.getElementById("apCalYearSelect").value = "";

  if (!rangeStart || (rangeStart && rangeEnd)) {
    rangeStart = iso;
    rangeEnd = "";
  } else {
    if (iso < rangeStart) {
      rangeEnd = rangeStart;
      rangeStart = iso;
    } else {
      rangeEnd = iso;
    }
  }


  periodMode = "range";
  listLimit = 12;
  draw();
};

      grid.appendChild(cell);
    }

    if (periodMode === "day" && selectedISO) {
  hint.textContent = `Filtrando pelo dia ${selectedISO.split("-").reverse().join("/")}.`;
} else if (periodMode === "range" && rangeStart && rangeEnd) {
  hint.textContent = `Período selecionado.`;
} else if (periodMode === "year") {
  hint.textContent = `Mostrando o ano inteiro de ${calYear}.`;
} else {
  hint.textContent = "Mostrando o mês inteiro.";
}
}
  async function setPaid(id, isPaid) {
    const item = apPayablesCache.find(x => String(x.id) === String(id));
    if (!item) return;

    await window.APPayablesStore.update(id, {
      ...item,
      status: isPaid ? "paid" : "pending",
      paidAt: isPaid ? new Date().toISOString() : ""
    });

    await loadAP();
    await draw();
  }

  function openCreateModal(existing, opts = {}) {
    const isEdit = !!existing;
    const viewOnly = !!opts.viewOnly;
    let editEnabled = !viewOnly;

    const x = isEdit ? { ...existing } : {
      id: uid(),
      title: "",
      category: "",
      supplier: "",
      amount: 0,
      dueDate: toISODate(new Date()),
      status: "pending",
      paidAt: "",
      paidMethod: "",
      notes: ""
    };

    const catOptions = getCategoryNames(apPayablesCache)
      .map(c => `<option value="${esc(c)}"></option>`)
      .join("");

    openModal(isEdit ? "Detalhes da conta" : "Nova conta a pagar", `
      <div class="ap-form">
        <div class="ap-grid">
          <div class="r-field">
            <label>Descrição</label>
            <input id="apFTitle" value="${esc(x.title)}">
          </div>

          <div class="r-field">
            <label>Categoria</label>
            <input id="apFCategory" value="${esc(x.category)}" list="apCatOptions" placeholder="Selecione ou digite...">
            <datalist id="apCatOptions">${catOptions}</datalist>
          </div>

          <div class="r-field">
            <label>Fornecedor</label>
            <input id="apFSupplier" value="${esc(x.supplier)}">
          </div>

          <div class="r-field">
            <label>Valor (R$)</label>
           <input id="apFAmount" type="text" inputmode="numeric" value="${moneyBR(x.amount || 0)}">
          </div>

          <div class="r-field">
            <label>Vencimento</label>
            <input id="apFDue" type="date" value="${esc(x.dueDate)}">
          </div>

          <div class="r-field">
            <label>Forma de pagamento</label>
            <select id="apFMethod">
              <option value="">—</option>
              <option value="pix" ${x.paidMethod === "pix" ? "selected" : ""}>Pix</option>
              <option value="cash" ${x.paidMethod === "cash" ? "selected" : ""}>Dinheiro</option>
              <option value="boleto" ${x.paidMethod === "boleto" ? "selected" : ""}>Boleto</option>
              <option value="card" ${x.paidMethod === "card" ? "selected" : ""}>Cartão</option>
              <option value="transfer" ${x.paidMethod === "transfer" ? "selected" : ""}>Transferência</option>
            </select>
          </div>
        </div>

        <div class="ap-row2" style="margin-top:10px;">
          <div class="r-field" id="apInstallWrap">
            <label>Parcelas</label>
            <input id="apFInst" type="number" min="1" value="1">
          </div>

          <div class="r-field">
            <label>Observações</label>
            <input id="apFNotes" value="${esc(x.notes)}">
          </div>
        </div>

       <div class="ap-recurring-box">
  <label class="ap-recurring-label">
    <input id="apFRecurring" type="checkbox">
    <span>
      Conta recorrente mensal
      <small>Usar para contas fixas que se repetem todo mês, sem quantidade final de parcelas.</small>
    </span>
  </label>
</div>

<div id="apInstAlert"></div>
<div id="apInstPreview" class="ap-parcelas-panel"></div>

        <div class="ap-modal-actions">
          ${isEdit ? `<button class="r-btn danger" id="apDelete" type="button">Excluir</button>` : ""}
          <button class="r-btn" id="apCancel" type="button">Cancelar</button>
          ${isEdit && viewOnly ? `<button class="r-btn" id="apEdit" type="button">Editar</button>` : ""}
          <button class="r-btn primary" id="apSave" type="button">${isEdit ? "Salvar" : "Criar"}</button>
        </div>
      </div>
    `);

    const ids = ["apFTitle", "apFCategory", "apFSupplier", "apFAmount", "apFDue", "apFMethod", "apFInst", "apFNotes"];

    function setFormEnabled(enabled) {
      editEnabled = !!enabled;

      ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        if (el.tagName === "SELECT") el.disabled = !enabled;
        else el.readOnly = !enabled;

        el.style.background = enabled ? "" : "#f8fafc";
        el.style.color = enabled ? "" : "#94a3b8";
        el.style.cursor = enabled ? "" : "default";
      });

      document.getElementById("apSave").style.display = enabled ? "inline-flex" : "none";
      if (document.getElementById("apDelete")) {
        document.getElementById("apDelete").style.display = enabled ? "inline-flex" : "none";
      }
      if (document.getElementById("apEdit")) {
        document.getElementById("apEdit").style.display = enabled ? "none" : "inline-flex";
      }
    }

    if (viewOnly) setFormEnabled(false);

    document.getElementById("apEdit")?.addEventListener("click", () => setFormEnabled(true));
    document.getElementById("apCancel").onclick = closeModal;

    const methodSel = document.getElementById("apFMethod");
    const instWrap = document.getElementById("apInstallWrap");
    const instInput = document.getElementById("apFInst");
    const preview = document.getElementById("apInstPreview");
    const dueInput = document.getElementById("apFDue");
    const amountInput = document.getElementById("apFAmount");

    const recurringInput = document.getElementById("apFRecurring");

amountInput.addEventListener("input", () => {
  formatMoneyInput(amountInput);
  renderInstallmentsPreview();
});

recurringInput?.addEventListener("change", renderInstallmentsPreview);

    function addMonthsISO(iso, add) {
      const d = new Date(`${iso}T00:00:00`);
      const day = d.getDate();
      d.setMonth(d.getMonth() + add);
      if (d.getDate() !== day) d.setDate(0);
      return toISODate(d);
    }

    function splitAmount(total, n) {
      const cents = Math.round(Number(total || 0) * 100);
      const base = Math.floor(cents / n);
      const rem = cents - base * n;

      return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
    }

function parseMoneyBR(value){
  const digits = String(value || "").replace(/\D/g, "");
  return Number(digits || 0) / 100;
}

function formatMoneyInput(input){
  const value = parseMoneyBR(input.value);
  input.value = moneyBR(value);
}

function getWeekDay(iso){
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "long" });
}

function renderInstallmentsPreview() {
  if (isEdit) {
    instWrap.style.display = "none";
    preview.innerHTML = "";
    return;
  }

  const recurring = document.getElementById("apFRecurring")?.checked;
  const method = methodSel.value;
  const isInstall = method === "boleto" || method === "card";

  instWrap.style.display = recurring || isInstall ? "grid" : "none";

  if (recurring) {
  instInput.value = "";
  instInput.disabled = true;

  const alertEl = document.getElementById("apInstAlert");
  if (alertEl) alertEl.innerHTML = "";

  preview.innerHTML = `
    <div class="ap-installment-alert ok">
      Conta recorrente mensal ativa. Será criada como conta fixa mensal.
    </div>
  `;
  return;
}

  instInput.disabled = false;

  if (!isInstall) {
  instInput.value = 1;
  preview.innerHTML = "";

  const alertEl = document.getElementById("apInstAlert");
  if (alertEl) alertEl.innerHTML = "";

  return;
}

  const n = Math.max(1, Number(instInput.value || 1));
  const total = parseMoneyBR(amountInput.value);
  const due = dueInput.value;

  if (!due || total <= 0 || n <= 1) {
  preview.innerHTML = "";

  const alertEl = document.getElementById("apInstAlert");
  if (alertEl) alertEl.innerHTML = "";

  return;
}

  const parts = splitAmount(total, n);

  preview.innerHTML = parts.map((value, i) => {
    const venc = addMonthsISO(due, i);

    return `
      <div class="ap-parcela-row">
        <div class="ap-parcela-n">${i + 1}ª</div>

        <div class="ap-parcela-date-wrap">
          <input type="date" class="ap-parcela-date" value="${venc}">
          <div class="ap-parcela-week">${getWeekDay(venc)}</div>
        </div>

        <input type="text" inputmode="numeric"
          class="ap-parcela-value"
          value="${moneyBR(value)}">
      </div>
    `;
  }).join("");

  preview.querySelectorAll(".ap-parcela-value").forEach(inp=>{
    inp.addEventListener("input", ()=> {
      formatMoneyInput(inp);
      validateInstallmentTotal();
    });
  });

  preview.querySelectorAll(".ap-parcela-date").forEach(inp=>{
    inp.addEventListener("change", ()=> {
      const wrap = inp.closest(".ap-parcela-date-wrap");
      const week = wrap.querySelector(".ap-parcela-week");
      week.textContent = getWeekDay(inp.value);
    });
  });

  validateInstallmentTotal();
}

function validateInstallmentTotal(){
  const alertEl = document.getElementById("apInstAlert");
  if (!alertEl) return;

  const total = parseMoneyBR(amountInput.value);
  const values = [...document.querySelectorAll(".ap-parcela-value")]
    .map(inp => parseMoneyBR(inp.value));

  if (!values.length) {
    alertEl.innerHTML = "";
    return;
  }

  const sumParts = values.reduce((a,b)=>a+b,0);
  const diff = Math.abs(total - sumParts);

  if (diff < 0.01) {
    alertEl.innerHTML = `
      <div class="ap-installment-alert ok">
        Parcelas fecham corretamente: ${moneyBR(sumParts)}
      </div>
    `;
  } else {
    alertEl.innerHTML = `
      <div class="ap-installment-alert bad">
        Atenção: soma das parcelas ${moneyBR(sumParts)} não bate com o valor total ${moneyBR(total)}.
      </div>
    `;
  }
}


    methodSel.addEventListener("change", renderInstallmentsPreview);
    instInput.addEventListener("input", renderInstallmentsPreview);
    dueInput.addEventListener("change", renderInstallmentsPreview);
    renderInstallmentsPreview();

    document.getElementById("apSave").onclick = async () => {
      if (!editEnabled) return;

      const title = document.getElementById("apFTitle").value.trim();
      const category = document.getElementById("apFCategory").value.trim();
      const supplier = document.getElementById("apFSupplier").value.trim();
      const amount = parseMoneyBR(document.getElementById("apFAmount").value);
      const dueDate = document.getElementById("apFDue").value;
      const paidMethod = document.getElementById("apFMethod").value;
      const notes = document.getElementById("apFNotes").value.trim();

      if (!title || !dueDate) {
        alert("Preencha descrição e vencimento.");
        return;
      }

      if (amount <= 0) {
        alert("Informe um valor maior que zero.");
        return;
      }

      const payload = {
        title,
        category,
        supplier,
        amount,
        dueDate,
        paidMethod,
        notes,
        status: isEdit ? (x.status || "pending") : "pending",
        paidAt: isEdit ? (x.paidAt || "") : ""
      };

      if (isEdit) {
        await window.APPayablesStore.update(x.id, {
          ...x,
          ...payload
        });
      } else {
        const isInstall = paidMethod === "boleto" || paidMethod === "card";
const inst = Math.max(1, Number(instInput.value || 1));

if (isInstall && inst > 1) {
  const groupId = uid();

  const dates = [...document.querySelectorAll(".ap-parcela-date")];
  const values = [...document.querySelectorAll(".ap-parcela-value")];

  for (let i = 0; i < inst; i++) {
    await window.APPayablesStore.create({
      ...payload,
      title: `${title} (${i + 1}/${inst})`,
      amount: parseMoneyBR(values[i].value),
      dueDate: dates[i].value,
      groupId,
      installment: i + 1,
      installments: inst
    });
  }

} else {
  await window.APPayablesStore.create(payload);
}
      }

      await loadAP();
      closeModal();
      await draw();
    };

    document.getElementById("apDelete")?.addEventListener("click", async () => {
      if (!confirm("Deseja excluir esta conta?")) return;

      await window.APPayablesStore.remove(x.id);
      await loadAP();
      closeModal();
      await draw();
    });
  }

  async function draw() {
    try {
      const all = await loadAP();
      await loadAPCats();

      const filtered = getFiltered(all);

      renderCategoryDropdown(all);
      renderSelectedChips();
      renderKPIs(all, filtered);
      renderPeriodInfo(filtered);
      renderList(filtered);
      renderCalendar(all);

      const pending = filtered.filter(x => apStatus(x) !== "paid");
      const paid = filtered.filter(x => apStatus(x) === "paid");

      const catTotals = new Map();
      filtered.forEach(x => {
        const cat = String(x.category || "Sem categoria");
        catTotals.set(cat, (catTotals.get(cat) || 0) + Number(x.amount || 0));
      });

      const topCat = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0];

      document.getElementById("apSummaryCount").textContent = String(filtered.length);
      document.getElementById("apSummaryPending").textContent = moneyBR(sum(pending));
      

      const { headers, rows } = buildExportRows(filtered.slice().sort(sortAccounts));

      const label =
        periodMode === "all" ? "geral" :
        periodMode === "day" && selectedISO ? `dia_${selectedISO}` :
        `mes_${String(calMonth + 1).padStart(2, "0")}_${calYear}`;

      document.getElementById("apQuickCSV").onclick = () => {
  downloadProfessionalCSV(`relatorio_contas_a_pagar_${label}`, filtered.slice().sort(sortAccounts));
};

document.getElementById("apQuickPDF").onclick = () => {
  openProfessionalPDF(filtered.slice().sort(sortAccounts));
};

    } catch (err) {
      console.error(err);
      alert(err?.message || String(err));
    }
  }

  renderBase();

  const apSearch = document.getElementById("apSearch");
  const apStatusFilter = document.getElementById("apStatusFilter");

  apSearch.addEventListener("input", () => {
    searchTerm = normalize(apSearch.value);
    listLimit = 12;
    draw();
  });

 apStatusFilter.addEventListener("change", () => {
  selectedStatus = apStatusFilter.value || "all";

  rangeStart = "";
  rangeEnd = "";

  if (selectedStatus === "all") {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    selectedISO = toISODate(now);
    periodMode = "day";
  } else {
    selectedISO = "";
    periodMode = "all";
  }

  listLimit = 12;
  draw();
});

  document.querySelectorAll(".ap-kpi-click").forEach(card => {
  card.addEventListener("click", () => {
    const status = card.getAttribute("data-status") || "all";
    const willSelect = selectedStatus !== status;

    selectedStatus = willSelect ? status : "all";
    apStatusFilter.value = selectedStatus;

    rangeStart = "";
    rangeEnd = "";

    if (willSelect) {
      selectedISO = "";
      periodMode = "all";
    } else {
      const now = new Date();
      calYear = now.getFullYear();
      calMonth = now.getMonth();
      selectedISO = toISODate(now);
      periodMode = "day";
    }

    listLimit = 12;
    draw();
  });
});


  document.getElementById("apCatBtn").addEventListener("click", () => {
    document.getElementById("apCatDropdown").classList.toggle("hidden");
  });

  document.addEventListener("click", (ev) => {
    const drop = document.getElementById("apCatDropdown");
    const btn = document.getElementById("apCatBtn");

    if (!drop || !btn) return;
    if (drop.classList.contains("hidden")) return;
    if (drop.contains(ev.target) || btn.contains(ev.target)) return;

    drop.classList.add("hidden");
  }, true);

document.getElementById("apCalToday").addEventListener("click", () => {
  const now = new Date();

  selectedStatus = "all";
  apStatusFilter.value = "all";

  calYear = now.getFullYear();
  calMonth = now.getMonth();
  selectedISO = toISODate(now);
  rangeStart = "";
  rangeEnd = "";
  selectedMonthFilter = null;
selectedYearFilter = null;
  periodMode = "day";
  listLimit = 12;

  draw();
});

  document.getElementById("apCalPrev").addEventListener("click", () => {
    calMonth--;
    if (calMonth < 0) {
      calMonth = 11;
      calYear--;
    }

    selectedISO = "";
    periodMode = "month";
    listLimit = 12;
    draw();
  });

  document.getElementById("apCalNext").addEventListener("click", () => {
    calMonth++;
    if (calMonth > 11) {
      calMonth = 0;
      calYear++;
    }

    selectedISO = "";
    periodMode = "month";
    listLimit = 12;
    draw();
  });

 document.getElementById("apCalMonthSelect").addEventListener("change", (e) => {
  selectedStatus = "all";
  apStatusFilter.value = "all";

  selectedISO = "";
  rangeStart = "";
  rangeEnd = "";

  selectedMonthFilter = e.target.value === "" ? null : Number(e.target.value);

  if (selectedMonthFilter !== null) {
    calMonth = selectedMonthFilter;
  }

  periodMode = selectedMonthFilter !== null || selectedYearFilter !== null ? "custom" : "all";
  listLimit = 12;

  draw();
});

document.getElementById("apCalYearSelect").addEventListener("change", (e) => {
  selectedStatus = "all";
  apStatusFilter.value = "all";

  selectedISO = "";
  rangeStart = "";
  rangeEnd = "";

  selectedYearFilter = e.target.value === "" ? null : Number(e.target.value);

  if (selectedYearFilter !== null) {
    calYear = selectedYearFilter;
  }

  periodMode = selectedMonthFilter !== null || selectedYearFilter !== null ? "custom" : "all";
  listLimit = 12;

  draw();
});


 document.getElementById("apCalClear").addEventListener("click", () => {
  selectedStatus = "all";
  apStatusFilter.value = "all";

  searchTerm = "";
  apSearch.value = "";

  selectedCategories.clear();
  selectedISO = "";
  rangeStart = "";
  rangeEnd = "";
  selectedMonthFilter = null;
selectedYearFilter = null;
  periodMode = "all";
  listLimit = 12;

  const monthSelect = document.getElementById("apCalMonthSelect");
  const yearSelect = document.getElementById("apCalYearSelect");
  if (monthSelect) monthSelect.value = "";
  if (yearSelect) yearSelect.value = "";

  draw();
});

  document.getElementById("apQuickNew")?.addEventListener("click", () => {
    openCreateModal(null);
  });

  selectedISO = toISODate(new Date());
  draw();
};