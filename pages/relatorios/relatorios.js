window.CorePageModules = window.CorePageModules || {};
window.CorePageModules.relatorios = function () {
  const content = document.getElementById("reportContent");

  const canViewReports = !!window.CoreAuth?.can?.("canViewReports");

if (!canViewReports) {
  content.innerHTML = `
    <div class="r-card">
      <div class="r-head">
        <div>
          <div class="r-title"><span class="ico">🔒</span> Relatórios bloqueados</div>
          <div class="r-sub">Seu perfil não possui acesso a esta área.</div>
        </div>
      </div>
    </div>
  `;
  return;
}

  // ===== EXPORT (CSV / PDF via print) =====
function csvEscape(v){
  const s = String(v ?? "");
  // se tiver ; " \n, envolve com aspas e duplica aspas internas
  if (/[;\n"]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

function downloadCSV(filename, headers, rows){
  const sep = ";"; // pt-BR/Excel friendly
  const lines = [];
  lines.push(headers.map(csvEscape).join(sep));
  rows.forEach(r => lines.push(r.map(csvEscape).join(sep)));
  const csv = lines.join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); // BOM pra Excel
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openPrintPDF(title, subtitle, headers, rows){
  const now = new Date();
  const stamp = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`;

  const css = `
    <style>
      body{ font-family: system-ui, Arial; padding: 24px; color:#0f172a; }
      h1{ font-size: 18px; margin:0 0 6px; }
      .sub{ color:#64748b; font-weight:700; margin:0 0 14px; font-size: 12px; }
      .meta{ color:#64748b; font-size: 12px; margin-bottom: 14px; }
      table{ width:100%; border-collapse: collapse; }
      th,td{ border:1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; }
      th{ background:#f8fafc; text-align:left; }
      @media print{
        button{ display:none; }
      }
    </style>
  `;

  const thead = `<tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr>`;
  const tbody = rows.map(r => `<tr>${r.map(c=>`<td>${String(c ?? "")}</td>`).join("")}</tr>`).join("");

  const html = `
    <html>
      <head>
        <title>${title}</title>
        ${css}
      </head>
      <body>
        <h1>${title}</h1>
        <div class="sub">${subtitle || ""}</div>
        <div class="meta">Gerado em: ${stamp}</div>
        <table>
          <thead>${thead}</thead>
          <tbody>${tbody}</tbody>
        </table>
        <script>
          window.onload = () => window.print();
        </script>
      </body>
    </html>
  `;

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
}


  // ===== helpers =====
  function moneyBR(v){
    const n = Number(v || 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function n2(v){
    const n = Number(v || 0);
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDateBR(d){
    return d.toLocaleDateString("pt-BR");
  }
  function isoDayKey(d){
    const x = new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth()+1).padStart(2,"0");
    const da = String(x.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }
  function parseDateInput(v){
    // input[type=date] -> "YYYY-MM-DD"
    if (!v) return null;
    const [y,m,d] = v.split("-").map(Number);
    return new Date(y, m-1, d, 0,0,0,0);
  }

  function uid(){
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}

  function reportEventFingerprint(evt){
  return [
    String(evt?.type || ""),
    String(evt?.saleId || ""),
    String(evt?.by || ""),
    String(evt?.at || ""),
    Number(evt?.amount ?? evt?.total ?? 0).toFixed(2)
  ].join("|");
}

function mapRemoteCashEvent(row){
  let noteObj = {};
  try {
    noteObj = row?.note ? JSON.parse(row.note) : {};
  } catch {
    noteObj = {};
  }

  const rawKind = String(row?.kind || "").toUpperCase();

  return {
    id: row.id,
    type: rawKind,
    at: row.created_at,
    by: noteObj?.by || "system",
    amount: noteObj?.amount != null
      ? Number(noteObj.amount || 0)
      : Number(row.amount_cents || 0) / 100,
    total: noteObj?.total != null ? Number(noteObj.total || 0) : null,
    payments: noteObj?.payments || null,
    costTotal: noteObj?.costTotal != null ? Number(noteObj.costTotal || 0) : 0,
    profit: noteObj?.profit != null ? Number(noteObj.profit || 0) : 0,
    saleId: noteObj?.saleId || null,
    meta: noteObj?.meta || {},
    note: row.note || null
  };
}

function mergeReportEvents(localEvents = [], remoteEvents = []){
  const map = new Map();

  [...remoteEvents, ...localEvents].forEach((evt) => {
    const key =
      evt?.type === "SALE" && evt?.saleId
        ? `sale:${evt.saleId}`
        : reportEventFingerprint(evt);

    if (!map.has(key)) {
      map.set(key, evt);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    return new Date(b.at).getTime() - new Date(a.at).getTime();
  });
}

async function loadCashEvents(startDate = null, endDate = null){
  const localEvents = (() => {
    try{
      const raw = window.CoreCash?.getEvents
        ? null
        : JSON.parse(localStorage.getItem("core.cash.events.v1") || "[]");

      if (raw && Array.isArray(raw)) return raw;

      return [];
    }catch{
      return [];
    }
  })();

  const localFiltered = (localEvents || []).filter(ev => {
    if (!ev?.at) return false;
    const t = new Date(ev.at).getTime();
    const gte = startDate ? t >= startDate.getTime() : true;
    const lte = endDate ? t <= endDate.getTime() : true;
    return gte && lte;
  });

  try{
    if (!window.CashStore?.listEventsByPeriod) {
      return localFiltered;
    }

    const rows = await window.CashStore.listEventsByPeriod({
      dateFrom: startDate ? startDate.toISOString() : null,
      dateTo: endDate ? endDate.toISOString() : null,
      limit: 5000
    });

    const remoteEvents = (rows || []).map(mapRemoteCashEvent);
    return mergeReportEvents(localFiltered, remoteEvents);
  }catch(err){
    console.error("[RELATORIOS] erro ao carregar cash_events por período:", err);
    return localFiltered;
  }
}

  function onlySales(events){
    return events.filter(e => e.type === "SALE");
  }

  function isCancelledSale(ev){
  return !!ev?.cancelledAt;
}

function onlyActiveSales(events){
  return onlySales(events).filter(ev => !isCancelledSale(ev));
}

async function getCancelledSaleIdsInRange(startDateISO, endDateISO){
  try{
    if (!window.SalesStore?.list) return new Set();

    const sales = await window.SalesStore.list({
      limit: 5000,
      orderBy: "created_at",
      ascending: false,
      startDateISO,
      endDateISO
    });

    const ids = new Set(
      (sales || [])
        .filter(sale => String(sale?.status || "").toLowerCase() === "cancelled")
        .map(sale => String(sale.id || "").trim())
        .filter(Boolean)
    );

    return ids;
  }catch(err){
    console.error("[ESTOQUE] erro ao buscar vendas canceladas:", err);
    return new Set();
  }
}

  function inRange(iso, start, end){
    const t = new Date(iso).getTime();
    return t >= start.getTime() && t <= end.getTime();
  }

  const REPORT_RANGE_KEY = "core.reports.range.v1";

function defaultRangeToday(){
  const start = new Date();
  start.setHours(0,0,0,0);

  const end = new Date();
  end.setHours(23,59,59,999);

  return { start, end };
}

function loadSavedReportRange(){
  try {
    const raw = localStorage.getItem(REPORT_RANGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;

    if (!parsed?.start || !parsed?.end) {
      return defaultRangeToday();
    }

    const start = parseDateInput(parsed.start);
    const end = parseDateInput(parsed.end);

    if (!start || !end) {
      return defaultRangeToday();
    }

    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);

    return { start, end };
  } catch {
    return defaultRangeToday();
  }
}

function saveReportRange(startValue, endValue){
  try {
    if (!startValue || !endValue) return;
    localStorage.setItem(REPORT_RANGE_KEY, JSON.stringify({
      start: startValue,
      end: endValue
    }));
  } catch {}
}

  function groupSalesByDay(sales){
    const map = new Map();
    for (const s of sales){
      const key = isoDayKey(s.at);
      map.set(key, (map.get(key)||0) + Number(s.total||0));
    }
    return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  }

  function calcKpis(sales){
  let total = 0;
  let cost = 0;
  let profitNet = 0;
  let feeTotal = 0;

  for (const e of (sales || [])){
    const t = Number(e.total || 0);
    const c = Number(e.costTotal || 0);

    total += t;
    cost += c;

    // lucro líquido: usa o profit snapshot quando existir (novo padrão)
    const p = (e.profit != null) ? Number(e.profit || 0) : (t - c);
    profitNet += p;

    // taxas: pega do snapshot salvo pela venda (quando existir)
    feeTotal += Number(e.meta?.cardFeeTotal || 0);
  }

  const count = sales.length;
  const ticket = count ? (total / count) : 0;

  // lucro bruto (sem taxas) só pra você ter disponível
  const profitGross = total - cost;

  return { total, count, ticket, cost, profitNet, profitGross, feeTotal };
}



  function uniq(arr){ return [...new Set(arr)]; }

  async function loadCustomers(){
  try{
    if (!window.CustomersStore?.list){
      console.warn("[RELATORIOS] CustomersStore não encontrado.");
      return [];
    }

    return await window.CustomersStore.list({
      limit: 1000,
      orderBy: "name",
      ascending: true
    });
  }catch(err){
    console.error("[RELATORIOS] Erro ao carregar clientes:", err);
    return [];
  }
}

let apCategoriesCache = [];
let apPayablesCache = [];

async function loadAPCats(){
  try{
    if (!window.APCategoriesStore?.list){
      console.warn("[RELATORIOS] APCategoriesStore não encontrado.");
      apCategoriesCache = [];
      return apCategoriesCache;
    }

    apCategoriesCache = await window.APCategoriesStore.list({
      limit: 1000,
      orderBy: "name",
      ascending: true
    });

    return apCategoriesCache;
  }catch(err){
    console.error("[RELATORIOS] Erro ao carregar categorias AP:", err);
    apCategoriesCache = [];
    return apCategoriesCache;
  }
}

async function loadAP(){
  try{
    if (!window.APPayablesStore?.list){
      console.warn("[RELATORIOS] APPayablesStore não encontrado.");
      apPayablesCache = [];
      return apPayablesCache;
    }

    apPayablesCache = await window.APPayablesStore.list({
      limit: 5000,
      orderBy: "due_date",
      ascending: true
    });

    return apPayablesCache;
  }catch(err){
    console.error("[RELATORIOS] Erro ao carregar contas a pagar:", err);
    apPayablesCache = [];
    return apPayablesCache;
  }
}


function dayStart(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}

function toISODate(d){ // YYYY-MM-DD
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2,"0");
  const da = String(x.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

function parseISODate(iso){
  if (!iso) return null;

  const s = String(iso).trim();

  // ✅ se vier ISO completo com hora (paidAt), usa Date() direto
  // ex: 2026-02-20T14:33:12.123Z
  if (s.includes("T")) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  // ✅ se vier só YYYY-MM-DD (dueDate), parse manual sem fuso
  const [y,m,d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m-1, d, 0,0,0,0);
}

function diffDays(a, b){
  const A = dayStart(a).getTime();
  const B = dayStart(b).getTime();
  return Math.floor((B - A) / 86400000);
}


function apStatus(item){
  // status salvo "paid" tem prioridade
  if (item.status === "paid") return "paid";
  const due = parseISODate(item.dueDate);
  if (!due) return "pending";
  const today = dayStart(new Date());
  if (due.getTime() < today.getTime()) return "late";
  if (due.getTime() === today.getTime()) return "today";
  return "pending";
}

function apBadge(st){
  if (st === "paid") return `<span class="ap-badge paid">Paga</span>`;
  if (st === "late") return `<span class="ap-badge late">Atrasada</span>`;
  if (st === "today") return `<span class="ap-badge today">Vence hoje</span>`;
  return `<span class="ap-badge pending">Pendente</span>`;
}

function sum(list){
  return (list || []).reduce((a,x)=> a + Number(x.amount || 0), 0);
}


// ========================================
// HELPERS DE MOVIMENTAÇÃO (PERDA / AJUSTE)
// ========================================

function loadStockMoves(){
  if (window.CoreInventory?.getStockMoves) {
    return window.CoreInventory.getStockMoves();
  }

  try{
    return JSON.parse(localStorage.getItem("core.stock.movements.v1") || "[]");
  }catch{
    return [];
  }
}


function groupMovesByDay(moves){
  const map = new Map();

  for(const m of moves){
    const key = isoDayKey(m.created_at || m.at);
    map.set(key, (map.get(key) || 0) + Number(m.qty || 0));
  }

  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}


  // ===== modal =====
  const rModal = document.getElementById("rModal");
  const rModalTitle = document.getElementById("rModalTitle");
  const rModalBody = document.getElementById("rModalBody");
  const rModalClose = document.getElementById("rModalClose");
  const rModalOk = document.getElementById("rModalOk");

  

  function openModal(title, html){
    rModalTitle.textContent = title;
    rModalBody.innerHTML = html;
    rModal.classList.remove("hidden");
  }
  function closeModal(){
    rModal.classList.add("hidden");
     rModalOk.style.display = ""; // 🔥 sempre volta ao normal
  }
  rModalClose.onclick = closeModal;
  rModalOk.onclick = closeModal;
  rModal.addEventListener("click", (e)=>{ if (e.target === rModal) closeModal(); });
  document.addEventListener("keydown", (e)=>{ if (!rModal.classList.contains("hidden") && e.key === "Escape") closeModal(); });

  // ===== placeholder =====
  function renderPlaceholder(title, msg){
    content.innerHTML = `
      <div class="r-card">
        <div class="r-head">
          <div>
            <div class="r-title"><span class="ico">📌</span> ${title}</div>
            <div class="r-sub">${msg}</div>
          </div>
        </div>
      </div>
    `;
  }

  // ===== Auditoria (mantém sua versão) =====
  function renderAuditoria(){
    const items = window.CoreAudit.list({ limit: 120 });

    content.innerHTML = `
      <div class="r-card">
        <div class="r-head">
          <div>
            <div class="r-title"><span class="ico">🕵️</span> Auditoria</div>
            <div class="r-sub">Logs do sistema</div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
  <button class="r-btn" id="btnRefresh">Atualizar</button>
  <button class="r-btn" id="btnExportCSV">CSV</button>
  <button class="r-btn" id="btnExportPDF">PDF</button>
  <button class="r-btn primary" id="btnClear" style="background:linear-gradient(135deg,#ef4444,#fb7185); box-shadow:none;">Limpar</button>
</div>

        </div>

        <div class="hr" style="margin:12px 0;"></div>
        <div id="auditList" style="display:grid; gap:10px;"></div>
      </div>
    `;

    const listEl = document.getElementById("auditList");
    const btnRefresh = document.getElementById("btnRefresh");
    const btnClear = document.getElementById("btnClear");

   async function draw(){
  try{
  const items = window.CoreAudit.list({ limit: 120 }) || [];

  // Render
  listEl.innerHTML = items.length
    ? items.map(it => {
        const when = it.at ? new Date(it.at) : null;
        const date = when ? when.toLocaleDateString("pt-BR") : "—";
        const time = when ? when.toLocaleTimeString("pt-BR") : "—";

        const who = it.by || it.user || it.email || "—";
        const action = it.action || it.kind || "—";
        const ref = it.ref || it.entityId || it.productId || "—";
        const extra = it.note || it.msg || it.details || "";

        return `
          <div class="r-row">
            <div style="font-weight:900">${action}</div>
            <div style="color:#64748b;font-weight:800">${date} ${time}</div>
            <div style="color:#0f172a;font-weight:900">${who}</div>
            <div style="color:#475569;font-weight:800">${ref}</div>
            <div style="color:#64748b">${String(extra).slice(0,120)}</div>
          </div>
        `;
      }).join("")
    : `<div style="color:#64748b;font-weight:800;">Sem logs por enquanto.</div>`;

  // Export (CSV/PDF) do que está na tela
  const headers = ["Ação", "Data", "Hora", "Usuário", "Ref", "Detalhes"];
  const rows = items.map(it => {
    const when = it.at ? new Date(it.at) : null;
    const date = when ? when.toLocaleDateString("pt-BR") : "—";
    const time = when ? when.toLocaleTimeString("pt-BR") : "—";
    const who = it.by || it.user || it.email || "—";
    const action = it.action || it.kind || "—";
    const ref = it.ref || it.entityId || it.productId || "—";
    const extra = it.note || it.msg || it.details || "";
    return [action, date, time, who, String(ref), String(extra)];
  });

  const btnCSV = document.getElementById("btnExportCSV");
  const btnPDF = document.getElementById("btnExportPDF");

  if (btnCSV) btnCSV.onclick = () => {
    const fn = `auditoria_${new Date().toISOString().slice(0,10)}`;
    downloadCSV(fn, headers, rows);
  };

 if (btnPDF) btnPDF.onclick = () => {
  openPrintPDF("Auditoria", "Logs do sistema", headers, rows);
};
} catch(err){
  console.error(err);
  alert(err?.message || String(err));
}
}
btnRefresh.onclick = () => draw();
    btnClear.onclick = () => { window.CoreAudit.clear(); draw(); };

    draw();
  }

  // ===== Dashboard =====
  function renderDashboard(){
    const { start, end } = loadSavedReportRange();
    const startStr = isoDayKey(start);
    const endStr = isoDayKey(end);

    content.innerHTML = `
      <div class="r-card">
        <div class="r-head">
          <div>
            <div class="r-title"><span class="ico">📈</span> Resumo de Vendas</div>
            <div class="r-sub">Vendas por dia e KPIs</div>
          </div>

          <div class="r-filters">
            <div class="r-field">
              <label>Início</label>
              <input type="date" id="dStart" value="${startStr}">
            </div>
            <div class="r-field">
              <label>Fim</label>
              <input type="date" id="dEnd" value="${endStr}">
            </div>
            <button class="r-btn primary" id="btnApply">Aplicar</button>
      <button class="r-btn" id="btnExportCSV">CSV</button>
<button class="r-btn" id="btnExportPDF">PDF</button>

          </div>
        </div>

        <div class="r-dashboard-stack">

<div class="r-section-label">Indicadores principais</div>
<div class="r-kpis r-kpis-main">
  <div class="r-kpi">
    <div class="k">Total vendido</div>
    <div class="v" id="kTotal">—</div>
  </div>

  <div class="r-kpi">
    <div class="k">Nº vendas</div>
    <div class="v" id="kCount">—</div>
  </div>

  <div class="r-kpi">
    <div class="k">Ticket médio</div>
    <div class="v" id="kTicket">—</div>
  </div>

  <div class="r-kpi">
    <div class="k">Lucro bruto</div>
    <div class="v" id="kProfitGross">—</div>
  </div>
</div>

  <div class="r-section-label">Formas de pagamento</div>
  <div class="r-kpis r-kpis-pay">
    <div class="r-kpi">
      <div class="k">Dinheiro</div>
      <div class="v" id="kCash">—</div>
    </div>

    <div class="r-kpi">
      <div class="k">Pix</div>
      <div class="v" id="kPix">—</div>
    </div>

    <div class="r-kpi">
      <div class="k">Crédito</div>
      <div class="v" id="kCredit">—</div>
    </div>

    <div class="r-kpi">
      <div class="k">Débito</div>
      <div class="v" id="kDebit">—</div>
    </div>
  </div>

  <div class="r-section-label">Custos e margem</div>
<div class="r-kpis r-kpis-result">
  <div class="r-kpi">
    <div class="k">Taxas (maquininha)</div>
    <div class="v" id="kFees">—</div>
  </div>

  <div class="r-kpi r-kpi-highlight">
    <div class="k">Lucro líquido</div>
    <div class="v" id="kProfit">—</div>
  </div>
</div>

</div>


        <div class="r-grid2 full">
  <div class="r-canvas-wrap">
    <div style="font-weight:950; color:#0f172a;">Vendas por dia</div>
    <canvas id="salesChart" height="140" style="width:100%; margin-top:8px;"></canvas>
    <div style="margin-top:6px; color:#64748b; font-weight:800; font-size:12px;">
      Eixo X: dias • Eixo Y: total vendido (R$)
    </div>
  </div>
</div>

      </div>
    `;

    const dStart = document.getElementById("dStart");
    const dEnd = document.getElementById("dEnd");
    const btnApply = document.getElementById("btnApply");

   function sumPaymentsFromCashEvents(salesEvents){
  let cash = 0, pix = 0, credit = 0, debit = 0;

  for (const ev of (salesEvents || [])){
    // aceita formatos:
    // A) ev.payments = {cash,pix,cardCredit,cardDebit}
    // B) ev.meta.payments = {cash,pix,cardCredit,cardDebit}
    // C) ev.payments = [{method,amount}, ...] (caso antigo)
    const p = ev.payments ?? ev.meta?.payments ?? null;

    if (Array.isArray(p)){
      for (const row of p){
        const m = String(row?.method || row?.type || "").toLowerCase();
        const a = Number(row?.amount || 0);
        if (!a) continue;

        if (m === "cash" || m === "dinheiro") cash += a;
        else if (m === "pix") pix += a;
        else if (m === "credit" || m === "cardcredit" || m === "credito" || m === "crédito") credit += a;
        else if (m === "debit" || m === "carddebit" || m === "debito" || m === "débito") debit += a;
      }
      continue;
    }

    if (p && typeof p === "object"){
      cash   += Number(p.cash || 0);
      pix    += Number(p.pix || 0);
      credit += Number(p.cardCredit || p.credit || 0);
      debit  += Number(p.cardDebit || p.debit || 0);
      continue;
    }

    // fallback ultra básico: payment_method + total (se existir)
    const pm = String(ev.payment_method || ev.meta?.payment_method || "").toLowerCase();
    const total = Number(ev.total || 0);

    if (pm === "cash") cash += total;
    else if (pm === "pix") pix += total;
    else if (pm === "card") credit += total; // não distingue
  }

  return { cash, pix, credit, debit };
}

    async function draw(){
  try{
      const s = parseDateInput(dStart.value) || start;
      const e = parseDateInput(dEnd.value) || end;
      e.setHours(23,59,59,999);

      saveReportRange(dStart.value, dEnd.value);

      const events = await loadCashEvents(s, e);

const cancelledSaleIds = await getCancelledSaleIdsInRange(
  s.toISOString(),
  e.toISOString()
);

const sales = onlyActiveSales(events).filter(x => {
  if (!x.at || !inRange(x.at, s, e)) return false;

  const saleKey = String(x.saleId || x.id || "").trim();
  if (saleKey && cancelledSaleIds.has(saleKey)) return false;

  return true;
});

      const k = calcKpis(sales);

document.getElementById("kTotal").textContent = moneyBR(k.total);
document.getElementById("kCount").textContent = String(k.count);
document.getElementById("kTicket").textContent = moneyBR(k.ticket);

// ✅ lucro líquido real
document.getElementById("kProfit").textContent = moneyBR(k.profitNet);

// ✅ extras
document.getElementById("kFees").textContent = moneyBR(k.feeTotal);
document.getElementById("kProfitGross").textContent = moneyBR(k.profitGross);

 // ✅ Por pagamento: calcula pelos eventos do CoreCash (sem Supabase = sem 400)
const pay = sumPaymentsFromCashEvents(sales);
let payCash = pay.cash, payPix = pay.pix, payCredit = pay.credit, payDebit = pay.debit;

document.getElementById("kCash").textContent = moneyBR(payCash);
document.getElementById("kPix").textContent = moneyBR(payPix);
document.getElementById("kCredit").textContent = moneyBR(payCredit);
document.getElementById("kDebit").textContent = moneyBR(payDebit);


      const series = groupSalesByDay(sales);
      drawLineChart(document.getElementById("salesChart"), series);

      const exportTitle = "Dashboard";
const exportSubtitle = `Período: ${dStart.value} até ${dEnd.value}`;

const headers = ["Dia", "Total do dia (R$)"];
const rows = series.map(([day, total]) => [day, Number(total||0).toFixed(2)]);

// Botões
document.getElementById("btnExportCSV").onclick = () => {
  const filename = `dashboard_${dStart.value}_${dEnd.value}`;

  const sep = ";";
  const lines = [];
  const push = (arr) => lines.push(arr.map(csvEscape).join(sep));

  // Cabeçalho
  push(["Dashboard"]);
  push([`Período: ${dStart.value} até ${dEnd.value}`]);
  push([""]);

  // Resumo
  push(["Resumo"]);
  push(["Total vendido", Number(k.total||0).toFixed(2)]);
  push(["Nº vendas", k.count]);
  push(["Ticket médio", Number(k.ticket||0).toFixed(2)]);
  push(["Lucro líquido", Number(k.profitNet||0).toFixed(2)]);
push(["Taxas (maquininha)", Number(k.feeTotal||0).toFixed(2)]);
push(["Lucro bruto", Number(k.profitGross||0).toFixed(2)]);

  push([""]);
  push(["Por forma de pagamento"]);
  push(["Dinheiro", Number(payCash||0).toFixed(2)]);
  push(["Pix", Number(payPix||0).toFixed(2)]);
  push(["Crédito", Number(payCredit||0).toFixed(2)]);
  push(["Débito", Number(payDebit||0).toFixed(2)]);
  push([""]);

  // Série do gráfico
  push(["Vendas por dia"]);
  push(["Dia", "Total do dia (R$)"]);
  series.forEach(([day, total]) => push([day, Number(total||0).toFixed(2)]));

  const csv = lines.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};


document.getElementById("btnExportPDF").onclick = () => {
  const title = "Dashboard";
  const subtitle = `Período: ${dStart.value} até ${dEnd.value}`;

  // Tabela 1: resumo
  const headers1 = ["Indicador", "Valor"];
  const rows1 = [
    ["Total vendido", moneyBR(k.total)],
    ["Nº vendas", String(k.count)],
    ["Ticket médio", moneyBR(k.ticket)],
    ["Lucro líquido", moneyBR(k.profitNet)],
["Taxas (maquininha)", moneyBR(k.feeTotal)],
["Lucro bruto", moneyBR(k.profitGross)],

    ["", ""],
    ["Dinheiro", moneyBR(payCash)],
    ["Pix", moneyBR(payPix)],
    ["Crédito", moneyBR(payCredit)],
    ["Débito", moneyBR(payDebit)],
  ];

  // Tabela 2: série
  const headers2 = ["Dia", "Total do dia (R$)"];
  const rows2 = series.map(([day, total]) => [day, moneyBR(total)]);

  // monta HTML com 2 tabelas
  const now = new Date();
  const stamp = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`;

  const css = `
    <style>
      body{ font-family: system-ui, Arial; padding: 24px; color:#0f172a; }
      h1{ font-size: 18px; margin:0 0 6px; }
      .sub{ color:#64748b; font-weight:700; margin:0 0 14px; font-size: 12px; }
      .meta{ color:#64748b; font-size: 12px; margin-bottom: 14px; }
      h2{ font-size: 13px; margin: 18px 0 8px; color:#0f172a; }
      table{ width:100%; border-collapse: collapse; }
      th,td{ border:1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; }
      th{ background:#f8fafc; text-align:left; }
      @media print{ button{ display:none; } }
    </style>
  `;

  function makeTable(headers, rows){
    const thead = `<tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr>`;
    const tbody = rows.map(r => `<tr>${r.map(c=>`<td>${String(c ?? "")}</td>`).join("")}</tr>`).join("");
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  }

  const html = `
    <html>
      <head><title>${title}</title>${css}</head>
      <body>
        <h1>${title}</h1>
        <div class="sub">${subtitle}</div>
        <div class="meta">Gerado em: ${stamp}</div>

        <h2>Resumo</h2>
        ${makeTable(headers1, rows1)}

        <h2>Vendas por dia</h2>
        ${makeTable(headers2, rows2)}

        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `;

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
};



      } catch(err){
    console.error(err);
    alert(err?.message || String(err));
  }
}

    btnApply.onclick = draw;
    draw();
  }

// ===== Lucro Real (Lucro das vendas - Contas pagas) =====
function renderResultado(){
  const { start, end } = loadSavedReportRange();
  const startStr = isoDayKey(start);
  const endStr = isoDayKey(end);

  content.innerHTML = `
    <div class="r-card">
      <div class="r-head">
        <div>
          <div class="r-title"><span class="ico">📊</span> Lucro Real</div>
          <div class="r-sub">Resultado do período: lucro das vendas − contas pagas</div>
        </div>

        <div class="r-filters">
          <div class="r-field">
            <label>Início</label>
            <input type="date" id="rStart" value="${startStr}">
          </div>
          <div class="r-field">
            <label>Fim</label>
            <input type="date" id="rEnd" value="${endStr}">
          </div>
          <button class="r-btn primary" id="rApply">Aplicar</button>
          <button class="r-btn" id="rExportCSV">CSV</button>
          <button class="r-btn" id="rExportPDF">PDF</button>
        </div>
      </div>

            <div class="r-kpis">
  <div class="r-kpi"><div class="k">Lucro (vendas)</div><div class="v" id="rkProfitSales">—</div></div>
  <div class="r-kpi"><div class="k">Contas pagas</div><div class="v" id="rkPaid">—</div></div>
  <div class="r-kpi r-kpi-highlight"><div class="k">Lucro real</div><div class="v" id="rkReal">—</div></div>
</div>

      <div class="r-grid2 full">
        <div class="r-canvas-wrap">
          <div style="font-weight:950; color:#0f172a;">Lucro real por dia</div>
          <canvas id="realChart" height="140" style="width:100%; margin-top:8px;"></canvas>
          <div style="margin-top:6px; color:#64748b; font-weight:800; font-size:12px;">
            Série: (lucro das vendas) − (contas pagas) por dia
          </div>
        </div>
      </div>
    </div>
  `;

  const rStart = document.getElementById("rStart");
  const rEnd = document.getElementById("rEnd");
  const rApply = document.getElementById("rApply");

  function profitOfSale(sEv){
    const t = Number(sEv.total || 0);
    const c = Number(sEv.costTotal || 0);
    return (sEv.profit != null) ? Number(sEv.profit || 0) : (t - c);
  }

  function eachDayKeys(s, e){
    const keys = [];
    const cur = new Date(s);
    cur.setHours(0,0,0,0);
    const endD = new Date(e);
    endD.setHours(0,0,0,0);
    while (cur.getTime() <= endD.getTime()){
      keys.push(isoDayKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return keys;
  }

  async function draw(){
  try{
    const s = parseDateInput(rStart.value) || start;
    const e = parseDateInput(rEnd.value) || end;
    e.setHours(23,59,59,999);

    saveReportRange(rStart.value, rEnd.value);

    // --- vendas
   const events = await loadCashEvents(s, e);

const cancelledSaleIds = await getCancelledSaleIdsInRange(
  s.toISOString(),
  e.toISOString()
);

const sales = onlyActiveSales(events).filter(x => {
  if (!x.at || !inRange(x.at, s, e)) return false;

  const saleKey = String(x.saleId || x.id || "").trim();
  if (saleKey && cancelledSaleIds.has(saleKey)) return false;

  return true;
});
    const k = calcKpis(sales);

    // --- contas pagas no período
    const apAll = await loadAP();
    const paid = apAll.filter(item => {
      const st = apStatus(item);
      if (st !== "paid") return false;

      // paidAt tem prioridade; fallback: dueDate
      const d = parseISODate(item.paidAt || item.dueDate);
      if (!d) return false;

      const dd = new Date(d);
      dd.setHours(12,0,0,0); // evita bug de fuso
      return dd.getTime() >= s.getTime() && dd.getTime() <= e.getTime();
    });

    const paidTotal = sum(paid);
    const real = k.profitNet - paidTotal;

    // KPIs
        document.getElementById("rkProfitSales").textContent = moneyBR(k.profitNet);
    document.getElementById("rkPaid").textContent = moneyBR(paidTotal);
    document.getElementById("rkReal").textContent = moneyBR(real);

    // --- séries por dia: lucro vendas e contas pagas
    const profitMap = new Map();
    for (const sEv of sales){
      const key = isoDayKey(sEv.at);
      profitMap.set(key, (profitMap.get(key)||0) + profitOfSale(sEv));
    }

    const paidMap = new Map();
    for (const item of paid){
      const key = String(item.paidAt || item.dueDate || "");
      const d = parseISODate(key);
      if (!d) continue;
      const kday = isoDayKey(d);
      paidMap.set(kday, (paidMap.get(kday)||0) + Number(item.amount || 0));
    }

    const keys = eachDayKeys(s, e);
    const series = keys.map(kday => {
      const pv = Number(profitMap.get(kday)||0);
      const pa = Number(paidMap.get(kday)||0);
      return [kday, (pv - pa)];
    });

    drawLineChartSigned(document.getElementById("realChart"), series);

    // exportações (baseadas nas séries)
    document.getElementById("rExportCSV").onclick = () => {
      const rows = series.map(([day, val]) => {
        const pv = Number(profitMap.get(day)||0);
        const pa = Number(paidMap.get(day)||0);
        return [day, n2(pv), n2(pa), n2(val)];
      });
      downloadCSV(
        `lucro-real_${rStart.value || startStr}_a_${rEnd.value || endStr}`,
        ["Dia","Lucro vendas","Contas pagas","Lucro real"],
        rows
      );
    };

    document.getElementById("rExportPDF").onclick = () => {
      const rows = series.map(([day, val]) => {
        const pv = Number(profitMap.get(day)||0);
        const pa = Number(paidMap.get(day)||0);
        return [day, moneyBR(pv), moneyBR(pa), moneyBR(val)];
      });
      openPrintPDF(
        "Lucro Real",
        `Período: ${rStart.value || startStr} até ${rEnd.value || endStr}`,
        ["Dia","Lucro vendas","Contas pagas","Lucro real"],
        rows
      );
    };
   } catch(err){
    console.error(err);
    alert(err?.message || String(err));
  }
}
  rApply.onclick = draw;
  draw();
}

function drawLineChart(canvas, series){
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  const cssW = canvas.clientWidth;
  const cssH = 240;

  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const padL = 52 * dpr;
  const padR = 24 * dpr;
  const padT = 28 * dpr;
  const padB = 92 * dpr;

  if (!series || !series.length){
    ctx.globalAlpha = .85;
    ctx.font = `${12*dpr}px system-ui, Arial`;
    ctx.fillText("Sem dados no período", padL, padT + 10*dpr);
    return;
  }

  const ys = series.map(x => Number(x[1] || 0));
  const maxY = Math.max(1, ...ys);

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const xStep = series.length === 1 ? 0 : plotW / (series.length - 1);

  const X = (i) => padL + i * xStep;
  const Y = (v) => padT + (1 - (v / maxY)) * plotH;

  // eixo X
  ctx.globalAlpha = .25;
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // eixo Y
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.stroke();

  // linhas horizontais
  ctx.globalAlpha = .18;
  [0, 0.5, 1].forEach(frac => {
    const v = maxY * frac;
    const y = Y(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  });

  // labels do eixo Y
  ctx.globalAlpha = .75;
  ctx.font = `${11*dpr}px system-ui, Arial`;
  ctx.fillText("0", 10*dpr, padT + plotH + 4*dpr);
  ctx.fillText(`${Math.round(maxY / 2)}`, 10*dpr, padT + plotH / 2 + 4*dpr);
  ctx.fillText(`${Math.round(maxY)}`, 10*dpr, padT + 4*dpr);

  // linha do gráfico
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath();
  ys.forEach((v, i) => {
    const x = X(i);
    const y = Y(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // pontos
  ctx.globalAlpha = .95;
  ys.forEach((v, i) => {
    const x = X(i);
    const y = Y(v);
    ctx.beginPath();
    ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
  });

  // valores dos pontos com fundo branco, sempre acima da linha
  ctx.font = `${11*dpr}px system-ui, Arial`;

  ys.forEach((v, i) => {
    const x = X(i);
    const y = Y(v);

    const label = `R$ ${Math.round(v)}`;
    const textW = ctx.measureText(label).width;
    const boxPadX = 6 * dpr;
    const boxPadY = 4 * dpr;
    const boxH = 20 * dpr;
    const boxW = textW + boxPadX * 2;

    let tx = x - (boxW / 2);
    if (tx < padL) tx = padL;
    if (tx + boxW > w - padR) tx = w - padR - boxW;

    let ty = y - 28 * dpr;
    if (ty < padT) ty = y + 10 * dpr;

    // fundo branco atrás do valor
    ctx.globalAlpha = .96;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(tx, ty, boxW, boxH, 8 * dpr);
    ctx.fill();

    // borda suave
    ctx.globalAlpha = .18;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    // texto
    ctx.globalAlpha = .9;
    ctx.fillStyle = "#0f172a";
    ctx.fillText(label, tx + boxPadX, ty + 14 * dpr);
  });

  // todas as datas no eixo X com ano
  ctx.globalAlpha = .75;
  ctx.font = `${10*dpr}px system-ui, Arial`;
  ctx.fillStyle = "#475569";

  series.forEach((item, i) => {
    const day = String(item[0] || "");
    const [year, month, date] = day.split("-");
    const label = `${date}/${month}/${year}`;

    const x = X(i);
    const yBase = padT + plotH + 28 * dpr;

    ctx.save();
    ctx.translate(x, yBase);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "right";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
}

function drawLineChartSigned(canvas, series){
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  const cssW = canvas.clientWidth;
  const cssH = 240;

  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const padL = 52 * dpr;
  const padR = 24 * dpr;
  const padT = 28 * dpr;
  const padB = 92 * dpr;

  if (!series || !series.length){
    ctx.globalAlpha = .85;
    ctx.font = `${12*dpr}px system-ui, Arial`;
    ctx.fillStyle = "#0f172a";
    ctx.fillText("Sem dados no período", padL, padT + 10*dpr);
    return;
  }

  const ys = series.map(x => Number(x[1] || 0));
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  if (minY === maxY){
    minY -= 1;
    maxY += 1;
  }

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const xStep = series.length === 1 ? 0 : plotW / (series.length - 1);

  const X = (i) => padL + i * xStep;
  const Y = (v) => padT + ((maxY - v) / (maxY - minY)) * plotH;

  // eixo X
  ctx.globalAlpha = .25;
  ctx.lineWidth = 1 * dpr;
  ctx.strokeStyle = "#0f172a";
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // eixo Y
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.stroke();

  // linhas horizontais
  ctx.globalAlpha = .18;
  [minY, (minY + maxY) / 2, maxY].forEach(v => {
    const y = Y(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  });

  // linha zero, se existir negativo/positivo
  if (minY < 0 && maxY > 0){
    const yz = Y(0);
    ctx.globalAlpha = .28;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(padL, yz);
    ctx.lineTo(padL + plotW, yz);
    ctx.stroke();
  }

  // labels eixo Y
  ctx.globalAlpha = .75;
  ctx.font = `${11*dpr}px system-ui, Arial`;
  ctx.fillStyle = "#0f172a";
  ctx.fillText(`${Math.round(minY)}`, 10*dpr, padT + plotH + 4*dpr);
  ctx.fillText(`${Math.round((minY + maxY) / 2)}`, 10*dpr, padT + plotH / 2 + 4*dpr);
  ctx.fillText(`${Math.round(maxY)}`, 10*dpr, padT + 4*dpr);

  // linha do gráfico
  ctx.globalAlpha = 1;
  ctx.lineWidth = 3 * dpr;
  ctx.strokeStyle = "#0f172a";
  ctx.beginPath();
  ys.forEach((v, i) => {
    const x = X(i);
    const y = Y(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // pontos
  ctx.globalAlpha = .95;
  ctx.fillStyle = "#0f172a";
  ys.forEach((v, i) => {
    const x = X(i);
    const y = Y(v);
    ctx.beginPath();
    ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
  });

  // labels dos pontos com caixinha
  ctx.font = `${11*dpr}px system-ui, Arial`;

  ys.forEach((v, i) => {
    const x = X(i);
    const y = Y(v);

    const label = moneyBR(v);
    const textW = ctx.measureText(label).width;
    const boxPadX = 6 * dpr;
    const boxPadY = 4 * dpr;
    const boxH = 20 * dpr;
    const boxW = textW + boxPadX * 2;

    let tx = x - (boxW / 2);
    if (tx < padL) tx = padL;
    if (tx + boxW > w - padR) tx = w - padR - boxW;

    let ty = y - 28 * dpr;
    if (ty < padT) ty = y + 10 * dpr;

    ctx.globalAlpha = .96;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(tx, ty, boxW, boxH, 8 * dpr);
    ctx.fill();

    ctx.globalAlpha = .18;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    ctx.globalAlpha = .9;
    ctx.fillStyle = "#0f172a";
    ctx.fillText(label, tx + boxPadX, ty + 14 * dpr);
  });

  // datas verticais com ano
  ctx.globalAlpha = .75;
  ctx.font = `${10*dpr}px system-ui, Arial`;
  ctx.fillStyle = "#475569";

  series.forEach((item, i) => {
    const day = String(item[0] || "");
    const [year, month, date] = day.split("-");
    const label = `${date}/${month}/${year}`;

    const x = X(i);
    const yBase = padT + plotH + 28 * dpr;

    ctx.save();
    ctx.translate(x, yBase);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "right";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
}

  // ===== Vendas =====
  function renderVendas(){
    const { start, end } = loadSavedReportRange();
    const startStr = isoDayKey(start);
    const endStr = isoDayKey(end);

    content.innerHTML = `
      <div class="r-card">
        <div class="r-head">
          <div>
            <div class="r-title"><span class="ico">🧾</span> Vendas</div>
            <div class="r-sub">Filtrar por período e usuário</div>
          </div>

          <div class="r-filters">
            <div class="r-field">
              <label>Início</label>
              <input type="date" id="vStart" value="${startStr}">
            </div>
            <div class="r-field">
              <label>Fim</label>
              <input type="date" id="vEnd" value="${endStr}">
            </div>
            <div class="r-field">
              <label>Usuário</label>
              <select id="vUser">
                <option value="">Todos</option>
              </select>
            </div>
            <button class="r-btn primary" id="btnVApply">Aplicar</button>
      <button class="r-btn" id="btnExportCSV">CSV</button>
<button class="r-btn" id="btnExportPDF">PDF</button>

          </div>
        </div>

        <div class="hr" style="margin:12px 0;"></div>
        <div id="vList" style="display:grid; gap:10px;"></div>
      </div>
    `;

    const vStart = document.getElementById("vStart");
    const vEnd = document.getElementById("vEnd");
    const vUser = document.getElementById("vUser");
    const btnVApply = document.getElementById("btnVApply");
    const vList = document.getElementById("vList");

    async function draw(){
  try{
      const s = parseDateInput(vStart.value) || start;
      const e = parseDateInput(vEnd.value) || end;
      e.setHours(23,59,59,999);

      saveReportRange(vStart.value, vEnd.value);

      const events = await loadCashEvents(s, e);
      const salesAll = onlySales(events).filter(x => x.at && inRange(x.at, s, e));

      // popular usuários
      const users = uniq(salesAll.map(x => x.by || "—"));
      vUser.innerHTML = `<option value="">Todos</option>` + users.map(u => `<option value="${u}">${u}</option>`).join("");

      const filtered = vUser.value ? salesAll.filter(x => (x.by || "—") === vUser.value) : salesAll;

      const exportTitle = "Vendas";
const exportSubtitle = `Período: ${vStart.value} até ${vEnd.value} • Usuário: ${vUser.value || "Todos"}`;

const headers = ["Status", "Data", "Hora", "Total (R$)", "Usuário", "Cliente"];
const rows = filtered
  .sort((a,b)=> new Date(b.at) - new Date(a.at))
  .map(sale => {
    const d = new Date(sale.at);
    const data = d.toLocaleDateString("pt-BR");
    const hora = d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    const cliente = sale.meta?.customer?.name || "";
    const status = isCancelledSale(sale) ? "CANCELADO" : "ATIVO";
    return [status, data, hora, Number(sale.total||0).toFixed(2), sale.by||"", cliente];
  });

document.getElementById("btnExportCSV").onclick = () => {
  downloadCSV(`vendas_${vStart.value}_${vEnd.value}`, headers, rows);
};
document.getElementById("btnExportPDF").onclick = () => {
  openPrintPDF(exportTitle, exportSubtitle, headers, rows);
};


      if (!filtered.length){
        vList.innerHTML = `<div style="color:#64748b; font-weight:800;">Sem vendas no período.</div>`;
        return;
      }

      vList.innerHTML = filtered
  .sort((a,b)=> new Date(b.at) - new Date(a.at))
  .map(sale => {
    const when = new Date(sale.at);
    const cust = sale.meta?.customer?.name ? ` • Cliente: ${sale.meta.customer.name}` : "";
    const cancelled = isCancelledSale(sale);

    const cancelledInfo = cancelled
      ? ` • <span style="color:#b91c1c;font-weight:900;">Venda cancelada</span>`
      : "";

    return `
      <div class="r-row ${cancelled ? "is-cancelled-sale" : ""}" data-id="${sale.id || ""}">
        <div class="r-row-top">
          <div class="t">
            ${moneyBR(sale.total || 0)}
            <span style="font-weight:800; color:#64748b;">
              • ${fmtDateBR(when)} ${when.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
            </span>
          </div>

          ${cancelled ? `<span class="r-cancel-badge">Cancelado</span>` : ``}
        </div>

        <div class="m">
          Usuário: <b>${sale.by || "—"}</b>${cust}${cancelledInfo}
        </div>
      </div>
    `;
  }).join("");

      vList.querySelectorAll(".r-row").forEach(row=>{
        row.addEventListener("click", ()=>{
          const id = row.getAttribute("data-id");
          const sale = filtered.find(x => String(x.id||"") === String(id));
          if (!sale) return;

const when = new Date(sale.at);
const whenBR = `${when.toLocaleDateString("pt-BR")} ${when.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`;


const customerName = sale.meta?.customer?.name || "—";
const userName = sale.by || "—";

const cancelledBadge = isCancelledSale(sale)
  ? `
    <div style="
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-width:118px;
      height:34px;
      padding:0 14px;
      border-radius:999px;
      background:#ef4444;
      color:#fff;
      font-weight:950;
      letter-spacing:.4px;
      text-transform:uppercase;
      font-size:12px;
      box-shadow:0 10px 20px rgba(239,68,68,.18);
      margin-top:10px;
    ">
      Cancelado
    </div>
    <div style="margin-top:8px;color:#b91c1c;font-weight:900;font-size:12px;">
      Esta venda foi cancelada e não deve entrar nos totais.
    </div>
  `
  : "";

const items = sale.meta?.items || [];
const rawPayments = sale.payments ?? sale.meta?.payments ?? null;

// aceita:
// 1) objeto CoreCash: {cash,pix,cardCredit,cardDebit}
// 2) array venda: [{method,amount}, ...]
let paymentsList = [];

if (Array.isArray(rawPayments)) {
  paymentsList = rawPayments;
} else if (rawPayments && typeof rawPayments === "object") {
  // converte objeto -> lista
  const map = [
    ["Dinheiro", rawPayments.cash],
    ["Pix", rawPayments.pix],
    ["Crédito", rawPayments.cardCredit],
    ["Débito", rawPayments.cardDebit],
  ];
  paymentsList = map
    .filter(([_, v]) => Number(v || 0) > 0)
    .map(([method, amount]) => ({ method, amount: Number(amount || 0) }));
}


// total final (já com desconto)
const totalFinal = Number(sale.total ?? 0);

// subtotal REAL (preferência: meta/subtotal; senão soma dos itens)
const itemsSubtotal = Array.isArray(items)
  ? items.reduce((acc, it) => acc + (Number(it.price || 0) * Number(it.qty || 0)), 0)
  : 0;

let subtotal = Number(
  sale.meta?.subtotal ??
  sale.subtotal ??
  sale.meta?.totalBeforeDiscount ??
  sale.meta?.cartSubtotal ??
  itemsSubtotal ??
  totalFinal ??
  0
);

// desconto (preferência: campos salvos; senão inferir por subtotal - total)
let discount = Number(
  sale.meta?.discount ??
  sale.discount ??
  sale.meta?.discountValue ??
  sale.meta?.discountAmount ??
  0
);

// 🔥 fallback: inferir desconto quando não veio salvo
if (!discount && subtotal > totalFinal) {
  discount = subtotal - totalFinal;
}



function itemThumb(it){
  const src = it.imageData || it.photo || it.image || it.img || "";
  if (src) return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  return `<div style="font-weight:950;color:#94a3b8;">IMG</div>`;
}

const opCosts = sale.meta?.operationalCosts || [];
const opFees = Number(sale.meta?.cardFeeTotal || 0);

const opCostsTotal = (opCosts || []).reduce((a, c) => a + Number(c.value || 0), 0);
const opTotal = opCostsTotal + opFees;

const costTotal = Number(sale.costTotal || 0);
const profitGross = Number(sale.meta?.profitGross != null ? sale.meta.profitGross : (totalFinal - costTotal));
const profitNet = Number(sale.profit != null ? sale.profit : (totalFinal - costTotal));


openModal("Detalhes da venda", `
  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
    <div>
  <div style="font-weight:950;color:#0f172a;font-size:16px;">
    Total: ${moneyBR(totalFinal)}
  </div>
  <div style="margin-top:6px;color:#64748b;font-weight:800;font-size:12px;">
    ${whenBR}
  </div>
  <div style="margin-top:6px;color:#334155;font-weight:900;font-size:12px;">
    Usuário: <b>${userName}</b> • Cliente: <b>${customerName}</b>
  </div>
  ${cancelledBadge}
</div>

    <div style="text-align:right;">
      <div style="color:#64748b;font-weight:900;font-size:12px;">Resumo</div>
      <div style="margin-top:6px;color:#334155;font-weight:900;font-size:12px;">
        Subtotal: <b>${moneyBR(subtotal)}</b>
      </div>
      <div style="margin-top:4px;color:#334155;font-weight:900;font-size:12px;">
        Desconto: <b>${moneyBR(discount)}</b>
      </div>
    </div>
  </div>

  <div class="hr" style="margin:12px 0;"></div>

  <div style="font-weight:950;color:#0f172a;">Itens</div>
  <div style="display:grid;gap:10px;margin-top:10px;">
    ${
      items.length
        ? items.map(it => {
            const qty = Number(it.qty || 0);
            const unit = Number(it.price || 0);
            const line = unit * qty;

            return `
              <div style="
                display:grid;
                grid-template-columns:56px 1fr auto;
                gap:12px;
                align-items:center;
                border:1px solid rgba(15,23,42,.08);
                background:rgba(255,255,255,.92);
                border-radius:18px;
                padding:10px;
              ">
                <div style="
                  width:56px;height:56px;border-radius:16px;overflow:hidden;
                  border:1px solid rgba(15,23,42,.08);
                  background:rgba(148,163,184,.14);
                  display:grid;place-items:center;
                ">
                  ${itemThumb(it)}
                </div>

                <div style="min-width:0;">
                  <div style="font-weight:950;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${it.name || "—"}
                  </div>
                  <div style="margin-top:4px;color:#64748b;font-weight:800;font-size:12px;">
                    Qtd: <b>${qty}</b> • Unit: <b>${moneyBR(unit)}</b>
                  </div>
                </div>

                <div style="font-weight:950;color:#0f172a;">
                  ${moneyBR(line)}
                </div>
              </div>
            `;
          }).join("")
        : `<div style="color:#64748b;font-weight:800;">Sem itens.</div>`
    }
  </div>

  <div class="hr" style="margin:12px 0;"></div>

  <div style="font-weight:950;color:#0f172a;">Pagamentos</div>
  <div style="display:grid;gap:8px;margin-top:10px;">
    ${
  paymentsList.length
    ? paymentsList.map(p => {
        const raw = (p.method || p.type || "—");
        const method =
          raw === "cash" ? "Dinheiro" :
          raw === "pix" ? "Pix" :
          raw === "debit" ? "Débito" :
          raw === "credit" ? "Crédito" :
          raw;

        const amount = Number(p.amount || 0);

        return `
          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            border:1px solid rgba(15,23,42,.08);
            background:rgba(255,255,255,.92);
            border-radius:18px;
            padding:10px 12px;
            font-weight:950;
            color:#0f172a;
          ">
            <span>${method}</span>
            <span>${moneyBR(amount)}</span>
          </div>
        `;
      }).join("")
    : `<div style="color:#64748b;font-weight:800;">Sem pagamentos.</div>`
}

  </div>

    <!-- ✅ COLE AQUI (Custos operacionais + Lucro) -->
  <div class="hr" style="margin:12px 0;"></div>

  <div style="font-weight:950;color:#0f172a;">Custos operacionais</div>
  <div style="display:grid;gap:8px;margin-top:10px;">
    ${
      opCosts.length
        ? opCosts.map(c => `
          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            border:1px solid rgba(15,23,42,.08);
            background:rgba(255,255,255,.92);
            border-radius:18px;
            padding:10px 12px;
            font-weight:900;
            color:#0f172a;
          ">
            <span>${c.label || "Custo"}</span>
            <span>${moneyBR(Number(c.value||0))}</span>
          </div>
        `).join("")
        : `<div style="color:#64748b;font-weight:800;">Nenhum custo operacional.</div>`
    }
    ${
      opCosts.length
        ? `<div style="text-align:right;color:#334155;font-weight:950;margin-top:4px;">Total: ${moneyBR(opTotal)}</div>`
        : ``
    }
  </div>

  <div class="hr" style="margin:12px 0;"></div>

  <div style="font-weight:950;color:#0f172a;">Lucro</div>
  <div style="display:grid;gap:8px;margin-top:10px;">
    <div style="
      display:flex;justify-content:space-between;align-items:center;
      border:1px solid rgba(15,23,42,.08);
      background:rgba(255,255,255,.92);
      border-radius:18px;
      padding:10px 12px;
      font-weight:950;
      color:#0f172a;
    ">
      <span>Lucro bruto</span>
      <span>${moneyBR(profitGross)}</span>
    </div>

    <div style="
      display:flex;justify-content:space-between;align-items:center;
      border:1px solid rgba(15,23,42,.08);
      background:rgba(255,255,255,.92);
      border-radius:18px;
      padding:10px 12px;
      font-weight:950;
      color:#0f172a;
    ">
      <span>Lucro líquido</span>
      <span>${moneyBR(profitNet)}</span>
    </div>
  </div>

  <div class="hr" style="margin:12px 0;"></div>

  <div style="display:flex;justify-content:flex-end;gap:12px;font-weight:950;color:#0f172a;">
    <div>Total final: ${moneyBR(totalFinal)}</div>
  </div>
`);

        });
      });
      } catch(err){
    console.error(err);
    alert(err?.message || String(err));
  }
}
  btnVApply.onclick = draw;
draw();
}


  function renderProdutos(){
  const { start, end } = loadSavedReportRange();
  const startStr = isoDayKey(start);
  const endStr = isoDayKey(end);

  content.innerHTML = `
    <div class="r-card">
      <div class="r-head">
        <div>
          <div class="r-title"><span class="ico">📦</span> Produtos</div>
          <div class="r-sub">Ranking por período (valor total e quantidade)</div>
        </div>

        <div class="r-filters">
          <div class="r-field">
            <label>Início</label>
            <input type="date" id="pStart" value="${startStr}">
          </div>
          <div class="r-field">
            <label>Fim</label>
            <input type="date" id="pEnd" value="${endStr}">
          </div>
          <button class="r-btn primary" id="btnPApply">Aplicar</button>
    <button class="r-btn" id="btnExportCSV">CSV</button>
<button class="r-btn" id="btnExportPDF">PDF</button>

        </div>
      </div>

      <div class="hr" style="margin:12px 0;"></div>
      <div id="pList" style="display:grid; gap:10px;"></div>
    </div>
  `;

  const pStart = document.getElementById("pStart");
  const pEnd = document.getElementById("pEnd");
  const btnPApply = document.getElementById("btnPApply");
  const pList = document.getElementById("pList");

  function thumb(src){
    if (src) return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
    return `<div style="font-weight:950;color:#94a3b8;">IMG</div>`;
  }

  async function draw(){
  try{
    const s = parseDateInput(pStart.value) || start;
    const e = parseDateInput(pEnd.value) || end;
    e.setHours(23,59,59,999);

    saveReportRange(pStart.value, pEnd.value);

    const events = await loadCashEvents(s, e);

const cancelledSaleIds = await getCancelledSaleIdsInRange(
  s.toISOString(),
  e.toISOString()
);

const sales = onlyActiveSales(events).filter(x => {
  if (!x.at || !inRange(x.at, s, e)) return false;

  const saleKey = String(x.saleId || x.id || "").trim();
  if (saleKey && cancelledSaleIds.has(saleKey)) return false;

  return true;
});

    const map = new Map(); // key -> {name, sku, qty, total, image}
    for (const sale of sales){
      const items = sale.meta?.items || [];
      for (const it of items){
        const key = it.id || it.sku || it.barcode || it.name || "—";
        const cur = map.get(key) || {
          name: it.name || key,
          sku: it.sku || it.id || it.barcode || "—",
          qty: 0,
          total: 0,
          image: it.imageData || it.photo || it.image || it.img || ""
        };

        const qty = Number(it.qty||0);
        const unit = Number(it.price||0);

        cur.qty += qty;
        cur.total += unit * qty;

        if (!cur.image && (it.imageData||it.photo||it.image||it.img)) {
          cur.image = it.imageData||it.photo||it.image||it.img;
        }

        map.set(key, cur);
      }
    }

    const ranked = [...map.values()].sort((a,b)=> b.total - a.total);

    const headers = ["Posição", "Produto", "SKU", "Qtd", "Total (R$)"];
const rows = ranked.map((p,i)=>[
  `${i+1}º`,
  p.name,
  p.sku,
  p.qty,
  Number(p.total||0).toFixed(2)
]);

document.getElementById("btnExportCSV").onclick = () => {
  downloadCSV(`produtos_${pStart.value}_${pEnd.value}`, headers, rows);
};
document.getElementById("btnExportPDF").onclick = () => {
  openPrintPDF("Produtos", `Período: ${pStart.value} até ${pEnd.value}`, headers, rows);
};


    if (!ranked.length){
      pList.innerHTML = `<div style="color:#64748b; font-weight:800;">Sem vendas no período.</div>`;
      return;
    }

    pList.innerHTML = ranked.map((p, idx) => `
      <div class="r-row" style="cursor:default;">
        <div style="
          display:grid;
          grid-template-columns:56px 1fr auto;
          gap:12px;
          align-items:center;
        ">
          <div style="
            width:56px;height:56px;border-radius:16px;overflow:hidden;
            border:1px solid rgba(15,23,42,.08);
            background:rgba(148,163,184,.14);
            display:grid;place-items:center;
          ">
            ${thumb(p.image)}
          </div>

          <div style="min-width:0;">
            <div class="t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${idx+1}º • ${p.name}
            </div>
            <div class="m">
              SKU: <b>${p.sku}</b> • Qtd: <b>${p.qty}</b>
            </div>
          </div>

          <div style="font-weight:950;color:#0f172a;">
            ${moneyBR(p.total)}
          </div>
        </div>
      </div>
    `).join("");
    } catch(err){
    console.error(err);
    alert(err?.message || String(err));
  }
}
 btnPApply.onclick = draw;
draw();
}




  function renderVendedores(){
  const { start, end } = loadSavedReportRange();
  const startStr = isoDayKey(start);
  const endStr = isoDayKey(end);

  content.innerHTML = `
    <div class="r-card">
      <div class="r-head">
        <div>
          <div class="r-title"><span class="ico">🏆</span> Vendedores</div>
          <div class="r-sub">Ranking por período (valor total)</div>
        </div>

        <div class="r-filters">
          <div class="r-field">
            <label>Início</label>
            <input type="date" id="vdStart" value="${startStr}">
          </div>
          <div class="r-field">
            <label>Fim</label>
            <input type="date" id="vdEnd" value="${endStr}">
          </div>

          <button class="r-btn primary" id="btnVdApply">Aplicar</button>
    <button class="r-btn" id="btnExportCSV">CSV</button>
<button class="r-btn" id="btnExportPDF">PDF</button>

        </div>
      </div>

      <div class="hr" style="margin:12px 0;"></div>
      <div id="vdList" style="display:grid; gap:10px;"></div>
    </div>
  `;

  const vdStart = document.getElementById("vdStart");
  const vdEnd = document.getElementById("vdEnd");
  const btnVdApply = document.getElementById("btnVdApply");
  const vdList = document.getElementById("vdList");


  async function draw(){
  try{
    const s = parseDateInput(vdStart.value) || start;
    const e = parseDateInput(vdEnd.value) || end;
    e.setHours(23,59,59,999);

    saveReportRange(vdStart.value, vdEnd.value);

    const events = await loadCashEvents(s, e);

const cancelledSaleIds = await getCancelledSaleIdsInRange(
  s.toISOString(),
  e.toISOString()
);

const sales = onlyActiveSales(events).filter(x => {
  if (!x.at || !inRange(x.at, s, e)) return false;

  const saleKey = String(x.saleId || x.id || "").trim();
  if (saleKey && cancelledSaleIds.has(saleKey)) return false;

  return true;
});

    const map = new Map(); // user -> {user,total,count}
    for (const sale of sales){
      const user = sale.by || "—";
      const cur = map.get(user) || { user, total: 0, count: 0 };
      cur.total += Number(sale.total || 0);
      cur.count += 1;
      map.set(user, cur);
    }

    const ranked = [...map.values()].sort((a,b)=> b.total - a.total);

    const headers = ["Posição", "Vendedor", "Vendas", "Total (R$)"];
const rows = ranked.map((u, i) => [
  `${i+1}º`,
  u.user,
  u.count,
  Number(u.total||0).toFixed(2)
]);

document.getElementById("btnExportCSV").onclick = () => {
  downloadCSV(`vendedores_${vdStart.value}_${vdEnd.value}`, headers, rows);
};
document.getElementById("btnExportPDF").onclick = () => {
  openPrintPDF("Vendedores", `Período: ${vdStart.value} até ${vdEnd.value}`, headers, rows);
};


    if (!ranked.length){
      vdList.innerHTML = `<div style="color:#64748b; font-weight:800;">Sem vendas no período.</div>`;
      return;
    }

    vdList.innerHTML = ranked.map((u, idx) => `
      <div class="r-row" style="cursor:default;">
        <div class="t">${idx+1}º • ${u.user}</div>
        <div class="m">Vendas: <b>${u.count}</b> • Total: <b>${moneyBR(u.total)}</b></div>
      </div>
    `).join("");

    vdList.querySelectorAll(".r-row").forEach(row=>{
  row.style.cursor = "pointer";

  row.addEventListener("click", async ()=>{
    const nameLine = row.querySelector(".t")?.textContent || "";
    const user = nameLine.split("•").pop().trim(); // pega depois do "1º •"

    const s = parseDateInput(vdStart.value) || start;
    const e = parseDateInput(vdEnd.value) || end;
    e.setHours(23,59,59,999);

    const events = await loadCashEvents(s, e);

const cancelledSaleIds = await getCancelledSaleIdsInRange(
  s.toISOString(),
  e.toISOString()
);

const salesAll = onlyActiveSales(events).filter(x => {
  if (!x.at || !inRange(x.at, s, e)) return false;

  const saleKey = String(x.saleId || x.id || "").trim();
  if (saleKey && cancelledSaleIds.has(saleKey)) return false;

  return true;
});

const sales = salesAll.filter(x => (x.by || "—") === user);

    // somatórios de pagamentos (modelo CoreCash: objeto)
    const paySum = { cash:0, pix:0, cardCredit:0, cardDebit:0 };

    // produtos vendidos
    const prodMap = new Map(); // key -> {name,qty,total,image}
    let total = 0;

    for (const sale of sales){
      total += Number(sale.total||0);

      const p = sale.payments || sale.meta?.payments || {};
      paySum.cash += Number(p.cash||0);
      paySum.pix += Number(p.pix||0);
      paySum.cardCredit += Number(p.cardCredit||0);
      paySum.cardDebit += Number(p.cardDebit||0);

      const items = sale.meta?.items || [];
      for (const it of items){
        const key = it.id || it.sku || it.barcode || it.name || "—";
        const cur = prodMap.get(key) || {
          name: it.name || key,
          qty: 0,
          total: 0,
          image: it.imageData || it.photo || it.image || it.img || ""
        };
        const qty = Number(it.qty||0);
        const unit = Number(it.price||0);

        cur.qty += qty;
        cur.total += unit * qty;

        // se antes não tinha imagem e agora tem, pega
        if (!cur.image && (it.imageData||it.photo||it.image||it.img)) {
          cur.image = it.imageData||it.photo||it.image||it.img;
        }

        prodMap.set(key, cur);
      }
    }

    const products = [...prodMap.values()].sort((a,b)=>b.total-a.total);

    function thumb(src){
      if (src) return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
      return `<div style="font-weight:950;color:#94a3b8;">IMG</div>`;
    }

    openModal(`Vendedor: ${user}`, `
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:space-between;">
        <div style="font-weight:950;color:#0f172a;">
          Total no período: ${moneyBR(total)}<br>
          <span style="color:#64748b;font-weight:800;font-size:12px;">Vendas: ${sales.length}</span>
        </div>

        <div style="text-align:right;">
          <div style="font-weight:950;color:#0f172a;">Pagamentos</div>
          <div style="color:#64748b;font-weight:900;font-size:12px;margin-top:6px;">
            Dinheiro: <b>${moneyBR(paySum.cash)}</b><br>
            Pix: <b>${moneyBR(paySum.pix)}</b><br>
            Crédito: <b>${moneyBR(paySum.cardCredit)}</b><br>
            Débito: <b>${moneyBR(paySum.cardDebit)}</b>
          </div>
        </div>
      </div>

      <div class="hr" style="margin:12px 0;"></div>

      <div style="font-weight:950;color:#0f172a;">Produtos vendidos</div>
      <div style="display:grid;gap:10px;margin-top:10px;">
        ${
          products.length ? products.map(p => `
            <div style="
              display:grid;
              grid-template-columns:56px 1fr auto;
              gap:12px;
              align-items:center;
              border:1px solid rgba(15,23,42,.08);
              background:rgba(255,255,255,.92);
              border-radius:18px;
              padding:10px;
            ">
              <div style="
                width:56px;height:56px;border-radius:16px;overflow:hidden;
                border:1px solid rgba(15,23,42,.08);
                background:rgba(148,163,184,.14);
                display:grid;place-items:center;
              ">
                ${thumb(p.image)}
              </div>

              <div style="min-width:0;">
                <div style="font-weight:950;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${p.name}
                </div>
                <div style="margin-top:4px;color:#64748b;font-weight:800;font-size:12px;">
                  Qtd: <b>${p.qty}</b>
                </div>
              </div>

              <div style="font-weight:950;color:#0f172a;">
                ${moneyBR(p.total)}
              </div>
            </div>
          `).join("") : `<div style="color:#64748b;font-weight:800;">Sem itens registrados.</div>`
        }
      </div>
    `);
  });
});

    } catch(err){
    console.error(err);
    alert(err?.message || String(err));
  }
}
  btnVdApply.onclick = draw;
draw();
}




  // ===== Caixa =====
  function renderCaixa(){
    const { start, end } = loadSavedReportRange();
    const startStr = isoDayKey(start);
    const endStr = isoDayKey(end);

    content.innerHTML = `
      <div class="r-card">
        <div class="r-head">
          <div>
            <div class="r-title"><span class="ico">💰</span> Caixa</div>
            <div class="r-sub">Eventos do caixa por período</div>
          </div>

          <div class="r-filters">
            <div class="r-field">
              <label>Início</label>
              <input type="date" id="cStart" value="${startStr}">
            </div>
            <div class="r-field">
              <label>Fim</label>
              <input type="date" id="cEnd" value="${endStr}">
            </div>
            <button class="r-btn primary" id="btnCApply">Aplicar</button>
      <button class="r-btn" id="btnExportCSV">CSV</button>
<button class="r-btn" id="btnExportPDF">PDF</button>

          </div>
        </div>

        <div class="r-kpis">
          <div class="r-kpi"><div class="k">Total vendido</div><div class="v" id="cSold">—</div></div>
          <div class="r-kpi"><div class="k">Suprimento</div><div class="v" id="cSup">—</div></div>
          <div class="r-kpi"><div class="k">Sangria</div><div class="v" id="cWit">—</div></div>
          <div class="r-kpi"><div class="k">Dinheiro</div><div class="v" id="cCash">—</div></div>
        </div>

        <div class="hr" style="margin:12px 0;"></div>
        <div id="cList" style="display:grid; gap:10px;"></div>
      </div>
    `;

    const cStart = document.getElementById("cStart");
    const cEnd = document.getElementById("cEnd");
    const btnCApply = document.getElementById("btnCApply");
    const cList = document.getElementById("cList");

    async function draw(){
  try{
      const s = parseDateInput(cStart.value) || start;
      const e = parseDateInput(cEnd.value) || end;
      e.setHours(23,59,59,999);

      saveReportRange(cStart.value, cEnd.value);

      const events = await loadCashEvents(s, e);

      const sales = onlyActiveSales(events);
      const sup = events.filter(x => x.type === "SUPPLY");
      const wit = events.filter(x => x.type === "WITHDRAW");

      const soldTotal = sales.reduce((a,x)=>a+Number(x.total||0),0);
      const supTotal = sup.reduce((a,x)=>a+Number(x.amount||0),0);
      const witTotal = wit.reduce((a,x)=>a+Number(x.amount||0),0);

      let cashTotal = 0;
for (const sEv of sales){
  const p = sEv.payments || sEv.meta?.payments || {};
  cashTotal += Number(p.cash || 0);
}


      document.getElementById("cSold").textContent = moneyBR(soldTotal);
      document.getElementById("cSup").textContent = moneyBR(supTotal);
      document.getElementById("cWit").textContent = moneyBR(witTotal);
      document.getElementById("cCash").textContent = moneyBR(cashTotal);

      if (!events.length){
        cList.innerHTML = `<div style="color:#64748b; font-weight:800;">Sem eventos no período.</div>`;
        return;
      }

      cList.innerHTML = events
        .sort((a,b)=> new Date(b.at) - new Date(a.at))
        .slice(0,120)
        .map(ev => {
          const when = new Date(ev.at);
          const right =
            ev.type === "SALE" ? moneyBR(ev.total||0) :
            (ev.amount != null ? moneyBR(ev.amount) : "");
          return `
            <div class="r-row" style="cursor:default;">
              <div class="t">${ev.type} <span style="font-weight:800; color:#64748b;">• ${fmtDateBR(when)} ${when.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span></div>
              <div class="m">${ev.by || "—"} ${right ? `• <b>${right}</b>` : ""}</div>
            </div>
          `;
        }).join("");
      } catch(err){
    console.error(err);
    alert(err?.message || String(err));
  }
}
  btnCApply.onclick = draw;
draw();
}

  // ===== Clientes =====
  function renderClientes(){
    const { start, end } = loadSavedReportRange();
    const startStr = isoDayKey(start);
    const endStr = isoDayKey(end);

    content.innerHTML = `
      <div class="r-card">
        <div class="r-head">
          <div>
            <div class="r-title"><span class="ico">👤</span> Clientes</div>
            <div class="r-sub">Ranking por período e histórico de compras</div>
          </div>

          <div class="r-filters">
            <div class="r-field">
              <label>Início</label>
              <input type="date" id="clStart" value="${startStr}">
            </div>
            <div class="r-field">
              <label>Fim</label>
              <input type="date" id="clEnd" value="${endStr}">
            </div>
            <button class="r-btn primary" id="btnClApply">Aplicar</button>
      <button class="r-btn" id="btnExportCSV">CSV</button>
<button class="r-btn" id="btnExportPDF">PDF</button>

          </div>
        </div>

        <div class="hr" style="margin:12px 0;"></div>
        <div id="clList" style="display:grid; gap:10px;"></div>
      </div>
    `;

    const clStart = document.getElementById("clStart");
    const clEnd = document.getElementById("clEnd");
    const btnClApply = document.getElementById("btnClApply");
    const clList = document.getElementById("clList");

    async function draw(){
  try{
      const s = parseDateInput(clStart.value) || start;
      const e = parseDateInput(clEnd.value) || end;
      e.setHours(23,59,59,999);

      saveReportRange(clStart.value, clEnd.value);

      const events = await loadCashEvents(s, e);

const cancelledSaleIds = await getCancelledSaleIdsInRange(
  s.toISOString(),
  e.toISOString()
);

const sales = onlyActiveSales(events).filter(x => {
  if (!x.at || !inRange(x.at, s, e)) return false;

  const saleKey = String(x.saleId || x.id || "").trim();
  if (saleKey && cancelledSaleIds.has(saleKey)) return false;

  return true;
});

      const map = new Map(); // id -> {id,name,total,count}
      for (const sale of sales){
        const c = sale.meta?.customer;
        if (!c || !c.id) continue;
        const cur = map.get(c.id) || { id:c.id, name:c.name||"—", total:0, count:0 };
        cur.total += Number(sale.total||0);
        cur.count += 1;
        map.set(c.id, cur);
      }

      // ✅ inclui clientes cadastrados (mesmo sem vendas no período)
const allCustomers = await loadCustomers();
for (const c of allCustomers){
  if (!map.has(c.id)){
    map.set(c.id, { id: c.id, name: c.name, count: 0, total: 0 });
  } else {
    // garante o nome do cadastro (caso a venda tenha vindo com nome diferente)
    const cur = map.get(c.id);
    if (cur && (!cur.name || cur.name === "—")) cur.name = c.name;
  }
}


      const ranked = [...map.values()].sort((a,b)=>b.total-a.total);

      const headers = ["Posição", "Cliente", "Compras", "Total (R$)"];
const rows = ranked.map((c,i)=>[
  `${i+1}º`,
  c.name,
  c.count,
  Number(c.total||0).toFixed(2)
]);

document.getElementById("btnExportCSV").onclick = () => {
  downloadCSV(`clientes_${clStart.value}_${clEnd.value}`, headers, rows);
};
document.getElementById("btnExportPDF").onclick = () => {
  openPrintPDF("Clientes", `Período: ${clStart.value} até ${clEnd.value}`, headers, rows);
};


      if (!ranked.length){
        clList.innerHTML = `<div style="color:#64748b; font-weight:800;">Sem vendas com cliente no período.</div>`;
        return;
      }

      clList.innerHTML = ranked.map((c, idx) => `
  <div class="r-row" data-cid="${c.id}">
    <div class="t">${idx+1}º • ${c.name}</div>
    <div class="m">Total: <b>${moneyBR(c.total)}</b> • Compras: <b>${c.count}</b></div>
  </div>
`).join("");


      clList.querySelectorAll(".r-row").forEach(row=>{
        row.addEventListener("click", ()=>{
          const cid = row.getAttribute("data-cid");

          const custSales = sales.filter(sale => sale.meta?.customer?.id === cid);

// somatório de pagamentos
const paySum = { cash:0, pix:0, cardCredit:0, cardDebit:0 };

// produtos agrupados
const itemsMap = new Map(); // key -> {name, qty, total, image}
let total = 0;

for (const sale of custSales){
  total += Number(sale.total||0);

  const p = sale.payments || sale.meta?.payments || {};
  paySum.cash += Number(p.cash||0);
  paySum.pix += Number(p.pix||0);
  paySum.cardCredit += Number(p.cardCredit||0);
  paySum.cardDebit += Number(p.cardDebit||0);

  const items = sale.meta?.items || [];
  for (const it of items){
    const key = it.id || it.sku || it.barcode || it.name || "—";
    const cur = itemsMap.get(key) || {
      name: it.name || key,
      qty: 0,
      total: 0,
      image: it.imageData || it.photo || it.image || it.img || ""
    };

    const qty = Number(it.qty||0);
    const unit = Number(it.price||0);

    cur.qty += qty;
    cur.total += unit * qty;

    if (!cur.image && (it.imageData||it.photo||it.image||it.img)){
      cur.image = it.imageData||it.photo||it.image||it.img;
    }

    itemsMap.set(key, cur);
  }
}

const rows = [...itemsMap.values()].sort((a,b)=>b.total-a.total);

function thumb(src){
  if (src) return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  return `<div style="font-weight:950;color:#94a3b8;">IMG</div>`;
}

openModal("Compras do cliente", `
  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
    <div>
      <div style="font-weight:950;color:#0f172a;">Total no período: ${moneyBR(total)}</div>
      <div style="margin-top:6px;color:#64748b;font-weight:800;">Compras: ${custSales.length}</div>
    </div>

    <div style="text-align:right;">
      <div style="font-weight:950;color:#0f172a;">Pagamentos</div>
      <div style="margin-top:6px;color:#64748b;font-weight:900;font-size:12px;line-height:1.55;">
        Dinheiro: <b>${moneyBR(paySum.cash)}</b><br>
        Pix: <b>${moneyBR(paySum.pix)}</b><br>
        Crédito: <b>${moneyBR(paySum.cardCredit)}</b><br>
        Débito: <b>${moneyBR(paySum.cardDebit)}</b>
      </div>
    </div>
  </div>

  <div class="hr" style="margin:12px 0;"></div>

  <div style="font-weight:950;color:#0f172a;">Produtos</div>
  <div style="display:grid; gap:10px; margin-top:10px;">
    ${
      rows.length ? rows.map(p => `
        <div style="
          display:grid;
          grid-template-columns:56px 1fr auto;
          gap:12px;
          align-items:center;
          border:1px solid rgba(15,23,42,.08);
          background:rgba(255,255,255,.92);
          border-radius:18px;
          padding:10px;
        ">
          <div style="
            width:56px;height:56px;border-radius:16px;overflow:hidden;
            border:1px solid rgba(15,23,42,.08);
            background:rgba(148,163,184,.14);
            display:grid;place-items:center;
          ">
            ${thumb(p.image)}
          </div>

          <div style="min-width:0;">
            <div style="font-weight:950;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${p.name}
            </div>
            <div style="margin-top:4px;color:#64748b;font-weight:800;font-size:12px;">
              Qtd: <b>${p.qty}</b>
            </div>
          </div>

          <div style="font-weight:950;color:#0f172a;">
            ${moneyBR(p.total)}
          </div>
        </div>
      `).join("") : `<div style="color:#64748b; font-weight:800;">Sem itens.</div>`
    }
  </div>
`);

        });
      });
      } catch(err){
    console.error(err);
    alert(err?.message || String(err));
  }
}
  btnClApply.onclick = draw;
draw();
}

  // =======================
// ESTOQUE (V2) — Compras / Ajustes / Perdas
// =======================

const KEY_PRODUCTS   = "core.products.v1";
const KEY_PURCHASES  = "core.stock.purchases.v1";
const KEY_MOVEMENTS  = "core.stock.movements.v1";

function safeLoad(key){
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function buildProductsIndex(){
  const list = safeLoad(KEY_PRODUCTS);

  const byId = new Map();
  const bySku = new Map();
  const byBarcode = new Map();

  for (const p of list){
    const id = String(p.id || "").trim();
    const sku = String(p.sku || "").trim();
    const barcode = String(p.barcode || "").trim();

    if (id) byId.set(id, p);
    if (sku) bySku.set(sku, p);
    if (barcode) byBarcode.set(barcode, p);
  }

  function pick(ref){
    if (!ref) return null;
    const id = String(ref.id || ref.productId || "").trim();
    const sku = String(ref.sku || "").trim();
    const barcode = String(ref.barcode || "").trim();

    return (id && byId.get(id)) || (sku && bySku.get(sku)) || (barcode && byBarcode.get(barcode)) || null;
  }

  return { list, pick };
}

// Normaliza "at" pra qualquer registro
function pickAt(x){
  return x.at || x.created_at || x.createdAt || x.date || x.doneAt || x.paidAt || null;
}

// Normaliza "qty"
function pickQty(x){
  return Number(
    x.qty ?? x.quantity ?? x.qtd ?? x.amountQty ?? x.deltaQty ?? 0
  ) || 0;
}

// Normaliza custo (pra compra)
function pickCost(x){
  return Number(
    x.cost ?? x.costUnit ?? x.unitCost ?? x.custo ?? x.priceCost ?? 0
  ) || 0;
}

// Normaliza total (pra compra)
function pickTotal(x){
  return Number(
    x.total ?? x.totalCost ?? x.totalValue ?? x.value ?? 0
  ) || 0;
}

function normalizePurchaseRow(row){
  // tenta extrair "produto"
  const ref = {
    id: row.productId || row.id || row.pid || (row.product && row.product.id),
    sku: row.sku || (row.product && row.product.sku),
    barcode: row.barcode || (row.product && row.product.barcode)
  };

  return {
    kind: "PURCHASE",
    at: pickAt(row),
    ref,
    qty: pickQty(row),
    cost: pickCost(row),
    total: pickTotal(row) || (pickQty(row) * pickCost(row)),
    note: row.note || row.obs || row.reason || "",
  };
}

function normalizeMoveRow(row){
  const ref = {
    id: row.productId || row.id || row.pid || (row.product && row.product.id),
    sku: row.sku || (row.product && row.product.sku),
    barcode: row.barcode || (row.product && row.product.barcode)
  };

  // seu padrão correto é row.type: "LOSS" | "ADJUST" | "PURCHASE"
  const type = String(row.type || row.kind || row.reason || "").toUpperCase();

  return {
    kind: type, // "LOSS" / "ADJUST"
    at: pickAt(row),
    ref,
    qty: pickQty(row),
    note: row.note || row.obs || "",
  };
}

function sumByDay(list, start, end){
  const map = new Map();
  for (const x of list){
    if (!x.at) continue;
    if (!inRange(x.at, start, end)) continue;
    const key = isoDayKey(x.at);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}

async function renderEstoque(){
  const sb =
    window.sb ||
    window.supabase ||
    window.supabaseClient ||
    window.CoreSupabase ||
    window.coreSupabase ||
    null;

  if (!sb || typeof sb.from !== "function") {
    console.error("Supabase client inválido:", sb);
    alert("Supabase não carregou corretamente. Verifique o supabaseClient.js.");
    return;
  }

  const { start, end } = loadSavedReportRange();
  const startStr = isoDayKey(start);
  const endStr = isoDayKey(end);

  content.innerHTML = `
    <div class="r-card">
      <div class="r-head">
        <div>
          <div class="r-title"><span class="ico">📦</span> Estoque</div>
          <div class="r-sub">Movimentações de compra, perda e ajuste</div>
        </div>

        <div class="r-filters">
          <div class="r-field">
            <label>Início</label>
            <input type="date" id="eStart" value="${startStr}">
          </div>

          <div class="r-field">
            <label>Fim</label>
            <input type="date" id="eEnd" value="${endStr}">
          </div>

          <div class="r-field">
            <label>Tipo</label>
            <select id="eType">
  <option value="all">Todos</option>
  <option value="compra">Compras</option>
  <option value="perda">Perdas</option>
  <option value="ajuste">Ajustes</option>
  <option value="venda">Vendas</option>
  <option value="cancelado">Cancelados</option>
</select>
          </div>

          <button class="r-btn primary" id="btnEApply">Aplicar</button>
          <button class="r-btn" id="btnExportCSV">CSV</button>
          <button class="r-btn" id="btnExportPDF">PDF</button>
        </div>
      </div>

      <div class="hr" style="margin:12px 0;"></div>
      <div id="eList" style="display:grid; gap:10px;"></div>
    </div>
  `;

  const eStart = document.getElementById("eStart");
  const eEnd = document.getElementById("eEnd");
  const eType = document.getElementById("eType");
  const btnEApply = document.getElementById("btnEApply");
  const eList = document.getElementById("eList");

  function startOfDayISO(dateStr){
    const [y,m,d] = String(dateStr || "").split("-").map(Number);
    const dt = new Date(y, (m - 1), d, 0, 0, 0, 0);
    return dt.toISOString();
  }

  function nextDayStartISO(dateStr){
    const [y,m,d] = String(dateStr || "").split("-").map(Number);
    const dt = new Date(y, (m - 1), d, 0, 0, 0, 0);
    dt.setDate(dt.getDate() + 1);
    return dt.toISOString();
  }

  function thumb(src){
    if (src) {
      return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
    }
    return `<div style="font-weight:950;color:#94a3b8;">IMG</div>`;
  }

 function moveColor(type){
  if (type === "compra") return "#16a34a";
  if (type === "perda") return "#ef4444";
  if (type === "ajuste") return "#0ea5e9";
  if (type === "venda") return "#ef4444";
  if (type === "cancelado") return "#dc2626";
  return "#0f172a";
}

  function signedText(type, qty){
  const n = Math.abs(Number(qty || 0));
  if (type === "compra") return `+${n}`;
  if (type === "perda") return `-${n}`;
  if (type === "ajuste") return `±${n}`;
  if (type === "venda") return `-${n}`;
  if (type === "cancelado") return `+${n}`;
  return String(n);
}

  async function draw(){
  try{
    saveReportRange(eStart.value, eEnd.value);

    const startISO = startOfDayISO(eStart.value);
    const endISO = nextDayStartISO(eEnd.value);
    const selectedType = eType.value;

      let query = sb
        .from("v_stock_moves_ledger")
        .select("*")
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .order("created_at", { ascending: false });

      const { data, error } = await query;

if (error){
  console.error("[ESTOQUE] erro query:", error);
  alert("Erro ao carregar movimentações do estoque.");
  return;
}

const rawRows = Array.isArray(data) ? data : [];

// busca ids das vendas canceladas no período
const cancelledSaleIds = await getCancelledSaleIdsInRange(startISO, endISO);

// regra:
// 1) remove a saída original da venda que foi cancelada
// 2) mantém o estorno e transforma ele em "cancelado"
let rows = rawRows
  .filter((r) => {
    const ref = String(r?.ref || "").trim();
    const note = String(r?.note || "").toUpperCase();

    const isCancelledSaleOutput =
      String(r?.move_type || "").toLowerCase() === "venda" &&
      ref &&
      cancelledSaleIds.has(ref);

    if (isCancelledSaleOutput) return false;

    return true;
  })
  .map((r) => {
    const note = String(r?.note || "").toUpperCase();

    const isCancelReversal =
      note.includes("ESTORNO VENDA CANCELADA") ||
      note.includes("VENDA CANCELADA") ||
      note.includes("CANCELAMENTO DE VENDA");

    if (isCancelReversal) {
      return {
        ...r,
        move_type: "cancelado"
      };
    }

    return r;
  });

if (selectedType !== "all") {
  rows = rows.filter((r) => String(r.move_type || "").toLowerCase() === selectedType);
}

      const headers = ["Data", "Hora", "Tipo", "Produto", "SKU", "Qtd", "Obs"];
      const exportRows = rows.map(r => {
        const d = new Date(r.created_at);
        return [
          d.toLocaleDateString("pt-BR"),
          d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          r.move_type || "",
          r.product_name || "Produto",
          r.product_sku || "",
          Number(r.qty || 0),
          r.note || ""
        ];
      });

      document.getElementById("btnExportCSV").onclick = () => {
        downloadCSV(
          `estoque_${eStart.value}_${eEnd.value}`,
          headers,
          exportRows
        );
      };

      document.getElementById("btnExportPDF").onclick = () => {
        openPrintPDF(
          "Estoque",
          `Período: ${eStart.value} até ${eEnd.value}${selectedType !== "all" ? ` • Tipo: ${selectedType}` : ""}`,
          headers,
          exportRows
        );
      };

      if (!rows.length){
        eList.innerHTML = `<div style="color:#64748b;font-weight:800;">Sem movimentações no período.</div>`;
        return;
      }

      eList.innerHTML = rows.map(r => {
  const date = new Date(r.created_at);
  const type = String(r.move_type || "").toLowerCase();
  const color = moveColor(type);

  let saleOperator = "";
let stockBefore = "";
let stockAfter = "";

if (type === "venda" || type === "cancelado") {
    const noteText = String(r.note || "");

    const byMatch =
      noteText.match(/por\s+([^•|]+)/i) ||
      noteText.match(/operador[:\s]+([^•|]+)/i) ||
      noteText.match(/usu[aá]rio[:\s]+([^•|]+)/i);

    const beforeMatch =
      noteText.match(/antes[:\s]+(-?\d+(?:[.,]\d+)?)/i) ||
      noteText.match(/estoque anterior[:\s]+(-?\d+(?:[.,]\d+)?)/i);

    const afterMatch =
      noteText.match(/depois[:\s]+(-?\d+(?:[.,]\d+)?)/i) ||
      noteText.match(/estoque atual[:\s]+(-?\d+(?:[.,]\d+)?)/i) ||
      noteText.match(/final[:\s]+(-?\d+(?:[.,]\d+)?)/i);

    if (byMatch?.[1]) {
      saleOperator = byMatch[1].trim();
    }

    if (beforeMatch?.[1]) {
      stockBefore = beforeMatch[1].replace(",", ".");
    }

    if (afterMatch?.[1]) {
      stockAfter = afterMatch[1].replace(",", ".");
    }
  }

  const extraSaleInfo = (type === "venda" || type === "cancelado")
  ? `
    ${saleOperator ? ` • Por: <b>${saleOperator}</b>` : ""}
    ${stockBefore !== "" ? ` • Antes: <b>${stockBefore}</b>` : ""}
    ${stockAfter !== "" ? ` • Atual: <b>${stockAfter}</b>` : ""}
  `
  : "";

  return `
    <div class="r-row" style="
  cursor:default;
  ${type === "cancelado" ? "background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.18);" : ""}
">
      <div style="display:grid;grid-template-columns:56px 1fr auto;gap:12px;align-items:center;">
        <div style="
          width:56px;height:56px;border-radius:16px;overflow:hidden;
          border:1px solid rgba(15,23,42,.08);
          background:rgba(148,163,184,.14);
          display:grid;place-items:center;
        ">
          ${thumb(r.product_image)}
        </div>

        <div style="min-width:0;">
          <div class="t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            <span style="color:${color};font-weight:950;text-transform:capitalize;">
  ${type === "cancelado" ? "cancelado" : type}
</span>
            ${r.product_name ? ` • ${r.product_name}` : ` • Produto`}
          </div>

          <div class="m" style="${type === "cancelado" ? "color:#b91c1c;font-weight:900;" : ""}">
  SKU: <b>${r.product_sku || "—"}</b>
  • ${date.toLocaleDateString("pt-BR")}
  ${date.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}
  ${extraSaleInfo}
  ${r.note ? ` • ${r.note}` : ""}
</div>
        </div>

<div style="
  font-weight:950;
  color:${type === "cancelado" ? "#16a34a" : color};
  white-space:nowrap;
">
  ${signedText(type, r.qty)}
</div>
      </div>
    </div>
  `;
}).join("");

    } catch(err){
      console.error("[ESTOQUE] erro draw:", err);
      alert(err?.message || String(err));
    }
  }

  btnEApply.onclick = draw;
  await draw();
}

// ===== CUPONS =====
function calcSaleSubtotal(sale){
  const items = sale?.meta?.items || sale?.items || [];
  return (items || []).reduce((s, it) => {
    return s + (Number(it.price || 0) * Number(it.qty || 0));
  }, 0);
}

// Retorna lista de descontos em dinheiro (já convertendo % -> R$)
// Cada item: { code, valueMoney }
function extractCouponDiscounts(sale){
  const ds = (sale?.meta?.discounts || sale?.discounts || []);
  if (!Array.isArray(ds) || !ds.length) return [];

  const subtotal = calcSaleSubtotal(sale);
  const out = [];

  for (const d of ds){
    const reasonRaw = String(d?.reason || "").trim();
    if (!reasonRaw) continue; // cupom = reason preenchido

    const code = reasonRaw.toUpperCase();
    const type = String(d?.type || "").toLowerCase();
    const val = Number(d?.value || 0);
    if (!val) continue;

    let money = 0;
    if (type === "percent") money = subtotal * (val / 100);
    else money = val; // "value"

    if (money > 0.0001){
      out.push({ code, valueMoney: money });
    }
  }

  return out;
}

function buildCouponsRanking(sales){
  const map = new Map();

  for (const s of sales){
    const coupons = extractCouponDiscounts(s);
    if (!coupons.length) continue;

    // Se tiver mais de 1 desconto com reason, cada um conta como cupom
    for (const c of coupons){
      if (!map.has(c.code)){
        map.set(c.code, { code: c.code, total: 0, uses: 0, sales: [] });
      }
      const row = map.get(c.code);
      row.total += Number(c.valueMoney || 0);
      row.uses += 1;
      row.sales.push({ sale: s, disc: Number(c.valueMoney || 0) });
    }
  }

  return Array.from(map.values()).sort((a,b) => b.total - a.total);
}

function renderCupons(){
  const { start, end } = loadSavedReportRange();
  const startStr = isoDayKey(start);
  const endStr = isoDayKey(end);

  content.innerHTML = `
    <div class="r-card">
      <div class="r-head">
        <div>
          <div class="r-title"><span class="ico">🏷️</span> Cupons</div>
          <div class="r-sub">Ranking por desconto concedido (valor total)</div>
        </div>

        <div class="r-filters">
          <div class="r-field">
            <label>Início</label>
            <input type="date" id="cpStart" value="${startStr}">
          </div>
          <div class="r-field">
            <label>Fim</label>
            <input type="date" id="cpEnd" value="${endStr}">
          </div>
          <button class="r-btn primary" id="btnCpApply">Aplicar</button>
        </div>
      </div>

      <div class="hr" style="margin:12px 0;"></div>
      <div id="cpList" style="display:grid; gap:10px;"></div>

    
    </div>
  `;

  const cpStart = document.getElementById("cpStart");
  const cpEnd   = document.getElementById("cpEnd");
  const cpList  = document.getElementById("cpList");
  const btnCpApply = document.getElementById("btnCpApply");

  async function draw(){
  try{
    const s = parseDateInput(cpStart.value) || start;
    const e = parseDateInput(cpEnd.value) || end;
    e.setHours(23,59,59,999);

    saveReportRange(cpStart.value, cpEnd.value);

   const events = await loadCashEvents(s, e);

const cancelledSaleIds = await getCancelledSaleIdsInRange(
  s.toISOString(),
  e.toISOString()
);

const sales = onlyActiveSales(events).filter(ev => {
  const iso = ev.at || ev.createdAt;
  if (!iso) return false;
  if (!inRange(iso, s, e)) return false;

  const saleKey = String(ev.saleId || ev.id || "").trim();
  if (saleKey && cancelledSaleIds.has(saleKey)) return false;

  return true;
});

    const ranking = buildCouponsRanking(sales);

    if (!ranking.length){
      cpList.innerHTML = `<div style="color:#64748b; font-weight:800;">Nenhum cupom encontrado no período.</div>`;
      return;
    }

    // ✅ layout igual "Produtos" (r-row)
    cpList.innerHTML = ranking.map((c, idx) => `
      <div class="r-row" data-code="${c.code}">
        <div class="t">${idx + 1}º • ${c.code}</div>
        <div class="m">
          Total concedido: <b>${moneyBR(c.total)}</b> • Vendas: <b>${c.uses}</b>
        </div>
      </div>
    `).join("");

    // ✅ clique abre MODAL (igual compras do cliente)
    cpList.querySelectorAll(".r-row").forEach(row => {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        const code = row.getAttribute("data-code");
        const data = ranking.find(x => x.code === code);
        if (!data) return;
        openCupomModal(code, data);
      });
    });
    } catch(err){
    console.error(err);
    alert(err?.message || String(err));
  }
}
  btnCpApply.onclick = draw;
draw();
}

async function renderContasPagar(){
  

  content.innerHTML = `
  <div class="r-card">
    <div class="r-head ap-head">
      <div>
        <div class="r-title"><span class="ico">💸</span> Contas a pagar</div>
        <div class="r-sub">Alertas, cadastro e pagamentos (admin/dev)</div>
      </div>

      <div class="r-filters ap-actions">
        <button class="r-btn primary" id="apAdd">+ Nova</button>
        <button class="r-btn" id="apExportCSV">CSV</button>
        <button class="r-btn" id="apExportPDF">PDF</button>
      </div>
    </div>

    <div class="hr" style="margin:12px 0;"></div>

    <div class="ap-top">
      <div class="ap-left">
        <div class="r-kpis ap-kpis">
  <div class="r-kpi"><div class="k">A vencer (7 dias)</div><div class="v" id="kApSoon">—</div></div>
  <div class="r-kpi"><div class="k">Vence hoje</div><div class="v" id="kApToday">—</div></div>
  <div class="r-kpi"><div class="k">Atrasadas</div><div class="v" id="kApLate">—</div></div>
  <div class="r-kpi"><div class="k">Pagas no mês</div><div class="v" id="kApPaidMonth">—</div></div>
</div>

      </div>

      <div class="ap-right">
        <div class="ap-cal">
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
            <div class="ap-cal-hint" id="apCalHint">Clique num dia para filtrar (opcional).</div>
            <button class="r-btn" id="apCalClear">Mês inteiro</button>
          </div>
        </div>
      </div>
    </div>

    <div class="hr" style="margin:12px 0;"></div>

    <div style="font-weight:950;color:#0f172a;">Alertas</div>
    <div id="apAlerts" style="display:grid;gap:10px;margin-top:10px;"></div>

    <div class="hr" style="margin:12px 0;"></div>

    <div style="font-weight:950;color:#0f172a;">Lista</div>
    <div id="apList" style="display:grid;gap:10px;margin-top:10px;"></div>
  </div>
`;

const apAdd = document.getElementById("apAdd");
const apListEl = document.getElementById("apList");
const apAlertsEl = document.getElementById("apAlerts");

const calPrev = document.getElementById("apCalPrev");
const calNext = document.getElementById("apCalNext");
const calTitle = document.getElementById("apCalTitle");
const calGrid  = document.getElementById("apCalGrid");
const calClear = document.getElementById("apCalClear");
const calHint  = document.getElementById("apCalHint");

// estado do calendário
let calYear = (new Date()).getFullYear();
let calMonth = (new Date()).getMonth(); // 0-11
let selectedISO = ""; // filtro por dia (opcional)
await loadAPCats();
await loadAP();

  function inRangeDue(item, s, e){
    const d = parseISODate(item.dueDate);
    if (!d) return false;
    return d.getTime() >= s.getTime() && d.getTime() <= e.getTime();
  }

  function openCreateModal(existing, opts){
    const isEdit = !!existing;
const viewOnly = !!(isEdit && opts && opts.viewOnly);
let editEnabled = !viewOnly; // se viewOnly, começa falso
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
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    openModal(isEdit ? "Editar conta" : "Nova conta a pagar", `
      <div class="ap-form">
        <div class="ap-grid">
          <div class="r-field">
            <label>Descrição</label>
            <input id="apFTitle" value="${String(x.title||"").replaceAll('"','&quot;')}">
          </div>

          <div class="r-field">
  <label>Categoria</label>

  <div style="display:flex; gap:8px; align-items:center;">
    <input id="apFCategory"
  value="${String(x.category || "").replaceAll('"','&quot;')}"
  readonly
  style="cursor:pointer;"
  placeholder="Selecione..."
>

    <button
  class="r-btn"
  id="apCatManage"
  type="button"
  title="Gerenciar categorias"
  style="
    min-width:42px;
    height:40px;
    padding:0;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    line-height:1;
  "
>+</button>

  </div>
</div>

<!-- Manager (fica oculto até clicar no +) -->
<div class="ap-cat-manager hidden" id="apCatManager">
  <div class="ap-cat-box">
    <div class="ap-cat-head">
      <div class="ap-cat-title">Categorias</div>
      <button class="r-btn" id="apCatClose" type="button" style="min-width:42px;">✕</button>
    </div>

    <div class="ap-cat-add">
      <input id="apCatNewName" placeholder="Nova categoria (ex: Aluguel, Energia...)">
      <button class="r-btn primary" id="apCatCreate" type="button">Adicionar</button>
    </div>

    <div class="ap-cat-list" id="apCatList"></div>
   <div class="ap-cat-foot">Clique na lixeira para remover uma categoria.</div>
  </div>
</div>



          <div class="r-field">
            <label>Fornecedor (opcional)</label>
            <input id="apFSupplier" value="${String(x.supplier||"").replaceAll('"','&quot;')}">
          </div>

          <div class="r-field">
            <label>Valor (R$)</label>
            <input id="apFAmount" type="number" step="0.01" value="${Number(x.amount||0)}">
          </div>

          <div class="r-field">
            <label>Vencimento</label>
            <input id="apFDue" type="date" value="${x.dueDate || ""}">
          </div>


          <div class="r-field">
            <label>Pagamento (forma)</label>
            <select id="apFMethod">
              <option value="">—</option>
              <option value="pix" ${x.paidMethod==="pix"?"selected":""}>Pix</option>
              <option value="cash" ${x.paidMethod==="cash"?"selected":""}>Dinheiro</option>
              <option value="boleto" ${x.paidMethod==="boleto"?"selected":""}>Boleto</option>
              <option value="card" ${x.paidMethod==="card"?"selected":""}>Cartão</option>
              <option value="transfer" ${x.paidMethod==="transfer"?"selected":""}>Transferência</option>
            </select>
          </div>
        </div>

      <div class="ap-row2" style="margin-top:10px;">
  <div id="apInstallWrap" style="display:none;">
    <div class="r-field">
      <label>Parcelas</label>
      <input id="apFInst" type="number" min="1" max="24" value="1">
    </div>
  </div>

  <div class="r-field">
    <label>Observações</label>
    <input id="apFNotes" value="${String(x.notes||"").replaceAll('"','&quot;')}">
  </div>
</div>

<div id="apInstPreview" style="margin-top:10px; display:grid; gap:8px;"></div>

        <div class="ap-modal-actions" style="
  display:flex;
  gap:10px;
  justify-content:flex-end;
  align-items:center;
  margin-top:14px;
">
  ${isEdit ? `<button class="r-btn" id="apDelete" style="border-color:rgba(239,68,68,.35); display:${viewOnly ? "none" : "inline-flex"}; min-height:40px; padding:0 14px; align-items:center; justify-content:center;">Excluir</button>` : ``}
  <button class="r-btn" id="apCancel" style="min-height:40px; padding:0 14px; align-items:center; justify-content:center;">Cancelar</button>
  ${isEdit ? `<button class="r-btn" id="apEdit" style="display:${viewOnly ? "inline-flex" : "none"}; min-height:40px; padding:0 14px; align-items:center; justify-content:center;">Editar</button>` : ``}
  <button class="r-btn primary" id="apSave" style="display:${viewOnly ? "none" : "inline-flex"}; min-height:40px; padding:0 14px; align-items:center; justify-content:center;">${isEdit ? "Salvar" : "Criar"}</button>
</div>
      </div>
    `);



    document.getElementById("apCancel").onclick = () => closeModal();

    // --- esconder botão "Fechar" do modal global nesse form
rModalOk.style.display = "none";

function setFormEnabled(enabled){
  editEnabled = !!enabled;

  const ids = ["apFTitle","apFSupplier","apFAmount","apFDue","apFMethod","apFNotes","apFInst"];

  ids.forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;

    // trava/destrava
    if (el.tagName === "SELECT") el.disabled = !enabled;
    else el.readOnly = !enabled;

    // ✅ VISUAL travado (cinza claro)
    if (!enabled){
      el.style.background = "#f8fafc";
      el.style.color = "#94a3b8";
      el.style.fontWeight = "800";
      el.style.opacity = "1";          // não “apaga” demais
      el.style.cursor = "default";
    } else {
      // ✅ VISUAL editável normal
      el.style.background = "";
      el.style.color = "";
      el.style.fontWeight = "";
      el.style.opacity = "";
      el.style.cursor = "";
    }
  });

  // categoria: sempre readonly, mas muda visual
  const catInput = document.getElementById("apFCategory");
  if (catInput){
    catInput.readOnly = true;
    if (!enabled){
      catInput.style.background = "#f8fafc";
      catInput.style.color = "#94a3b8";
      catInput.style.fontWeight = "800";
      catInput.style.opacity = "1";
      catInput.style.cursor = "default";
    } else {
      catInput.style.background = "";
      catInput.style.color = "";
      catInput.style.fontWeight = "";
      catInput.style.opacity = "";
      catInput.style.cursor = "pointer"; // porque você abre dropdown
    }
  }

  // botões
  const btnEdit = document.getElementById("apEdit");
  const btnSave = document.getElementById("apSave");
  const btnDel  = document.getElementById("apDelete");
  const catManageBtn = document.getElementById("apCatManage");

  if (btnEdit) btnEdit.style.display = enabled ? "none" : "inline-flex";
  if (btnSave) btnSave.style.display = enabled ? "inline-flex" : "none";
  if (btnDel)  btnDel.style.display  = enabled ? "inline-flex" : "none";
  if (catManageBtn) catManageBtn.style.display = enabled ? "inline-flex" : "none";
}


if (viewOnly) setFormEnabled(false);

const btnEdit = document.getElementById("apEdit");
if (btnEdit){
  btnEdit.onclick = ()=> setFormEnabled(true);
}


// --- categorias (dropdown flutuante + gerenciador)
const catInput = document.getElementById("apFCategory");
const catManageBtn = document.getElementById("apCatManage");

const mgr = document.getElementById("apCatManager");
const mgrClose = document.getElementById("apCatClose");
const mgrList = document.getElementById("apCatList");
const mgrNewName = document.getElementById("apCatNewName");
const mgrCreate = document.getElementById("apCatCreate");

let catDropEl = null;

function escHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function closeCatDropdown(){
  if (catDropEl){
    catDropEl.remove();
    catDropEl = null;
  }
}

function openCatDropdown(){
  closeCatDropdown();

  const cats = apCategoriesCache;
  const rect = catInput.getBoundingClientRect();

  catDropEl = document.createElement("div");
  catDropEl.className = "ap-cat-drop";
  catDropEl.style.left = rect.left + "px";
  catDropEl.style.top = (rect.top - 8) + "px";
  catDropEl.style.width = rect.width + "px";

  catDropEl.innerHTML = `
    <div class="ap-cat-drop-inner">
      ${cats.map(c => `
        <button type="button" class="ap-cat-pick" data-cat="${escHtml(c.name)}">${escHtml(c.name)}</button>
      `).join("")}
    </div>
  `;

  document.body.appendChild(catDropEl);

  catDropEl.querySelectorAll(".ap-cat-pick").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      catInput.value = btn.getAttribute("data-cat") || "";
      closeCatDropdown();
    });
  });

  setTimeout(()=>{
    const onDoc = (e)=>{
      if (!catDropEl) return;
      if (e.target === catInput) return;
      if (catDropEl.contains(e.target)) return;
      document.removeEventListener("click", onDoc, true);
      closeCatDropdown();
    };
    document.addEventListener("click", onDoc, true);
  }, 0);
}

function renderCatManager(){
  const cats = apCategoriesCache;

  mgrList.innerHTML = cats.map(c => `
    <div class="ap-cat-row">
      <div class="ap-cat-name">${escHtml(c.name)}</div>
      <button type="button" class="r-btn ap-cat-trash" data-del="${c.id}">🗑</button>
    </div>
  `).join("");

  mgrList.querySelectorAll(".ap-cat-trash").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const delId = btn.getAttribute("data-del");
      await window.APCategoriesStore.remove(delId);
      await loadAPCats();

      const stillExists = apCategoriesCache.some(c => c.name === catInput.value);
      if (!stillExists) catInput.value = "";

      renderCatManager();
    });
  });
}

function openCatManager(){
  renderCatManager();
  mgr.classList.remove("hidden");
  mgrNewName.value = "";
  mgrNewName.focus();
}

function closeCatManager(){
  mgr.classList.add("hidden");
}

catInput.addEventListener("click", ()=>{
  if (!editEnabled) return;  // ✅ travado
  openCatDropdown();
});

catManageBtn.addEventListener("click", ()=>{
  if (!editEnabled) return;  // ✅ travado
  closeCatDropdown();
  openCatManager();
});


mgrClose.addEventListener("click", closeCatManager);

mgr.addEventListener("click", (e)=>{
  if (e.target === mgr) closeCatManager();
});

mgrCreate.addEventListener("click", async ()=>{
  const n = String(mgrNewName.value || "").trim();
  if (!n) return;

  await window.APCategoriesStore.create({ name: n });
  await loadAPCats();

  catInput.value = n;
  renderCatManager();
  mgrNewName.value = "";
  mgrNewName.focus();
});


// --- parcelas
const methodSel = document.getElementById("apFMethod");
const instWrap = document.getElementById("apInstallWrap");
const instInp = document.getElementById("apFInst");
const prevEl = document.getElementById("apInstPreview");
const dueInp = document.getElementById("apFDue");
const amtInp = document.getElementById("apFAmount");

function addMonthsISO(iso, add){
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  d.setMonth(d.getMonth() + add);

  // ajuste pra meses menores (ex: 31 -> 30/28)
  if (d.getDate() !== day){
    d.setDate(0); // último dia do mês anterior
  }
  return isoDayKey(d);
}

function splitAmount(total, n){
  const cents = Math.round(Number(total||0) * 100);
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  const parts = Array.from({length:n}, (_,i)=> base + (i < rem ? 1 : 0));
  return parts.map(c => c / 100);
}

function renderInstallmentsPreview(){
  const method = String(methodSel.value || "");
  const due = dueInp.value;
  const total = Number(amtInp.value || 0);
  const n = Math.max(1, Math.min(24, Number(instInp.value || 1)));

  const isInstall = (method === "boleto" || method === "card");
  instWrap.style.display = isInstall ? "block" : "none";
  if (!isInstall){
    prevEl.innerHTML = "";
    instInp.value = 1;
    return;
  }

  if (!due || total <= 0){
    prevEl.innerHTML = `<div style="color:#64748b; font-weight:800;">Defina vencimento e valor para ver as parcelas.</div>`;
    return;
  }

  const parts = splitAmount(total, n);
  prevEl.innerHTML = parts.map((v,i)=>{
    const venc = addMonthsISO(due, i);
    return `
      <div style="display:flex; justify-content:space-between; gap:10px; padding:8px 10px; border:1px solid rgba(15,23,42,.08); border-radius:14px;">
        <div style="font-weight:900; color:#0f172a;">${(i+1)}ª parcela • ${venc.split("-").reverse().join("/")}</div>
        <div style="font-weight:950; color:#0f172a;">${moneyBR(v)}</div>
      </div>
    `;
  }).join("");
}

methodSel.addEventListener("change", renderInstallmentsPreview);
instInp.addEventListener("input", renderInstallmentsPreview);
dueInp.addEventListener("change", renderInstallmentsPreview);
amtInp.addEventListener("input", renderInstallmentsPreview);

renderInstallmentsPreview();


 const btnSave = document.getElementById("apSave");
btnSave.onclick = async () => {
  const title = document.getElementById("apFTitle").value.trim();
  const category = document.getElementById("apFCategory").value.trim();
  const supplier = document.getElementById("apFSupplier").value.trim();
  const amountTotal = Number(document.getElementById("apFAmount").value || 0);
  const dueDate = document.getElementById("apFDue").value;
  const paidMethod = document.getElementById("apFMethod").value;
  const notes = document.getElementById("apFNotes").value.trim();

  if (!title || !dueDate){
    alert("Preencha descrição e vencimento.");
    return;
  }

  if (amountTotal <= 0){
    alert("Informe um valor maior que zero.");
    return;
  }

  const nowIso = new Date().toISOString();

  const base = {
  title,
  category,
  supplier,
  notes,
  paidMethod,
  status: isEdit ? (x.status || "pending") : "pending",
  paidAt: isEdit ? (x.paidAt || "") : ""
};

  const isInstall = (paidMethod === "boleto" || paidMethod === "card");
  const inst = Math.max(1, Math.min(24, Number(document.getElementById("apFInst")?.value || 1)));

  if (isEdit){
    await window.APPayablesStore.update(x.id, {
      ...x,
      ...base,
      amount: amountTotal,
      dueDate
    });

    await loadAP();
    closeModal();
    await draw();
    return;
  }

  if (isInstall && inst > 1){
    const groupId = uid();
    const parts = splitAmount(amountTotal, inst);

    for (let i=0; i<inst; i++){
      await window.APPayablesStore.create({
        ...base,
        title: `${title} (${i+1}/${inst})`,
        amount: parts[i],
        dueDate: addMonthsISO(dueDate, i),
        groupId,
        installment: i+1,
        installments: inst
      });
    }
  } else {
    await window.APPayablesStore.create({
      ...base,
      amount: amountTotal,
      dueDate
    });
  }

  await loadAP();
  closeModal();
  await draw();
};


    if (isEdit){
  const btnDel = document.getElementById("apDelete");
  btnDel.onclick = async () => {
    await window.APPayablesStore.remove(x.id);
    await loadAP();
    closeModal();
    await draw();
  };
}
  }

  async function setPaid(id, isPaid){
  const item = apPayablesCache.find(i => i.id === id);
  if (!item) return;

  const nowIso = new Date().toISOString();

  await window.APPayablesStore.update(id, {
    ...item,
    status: isPaid ? "paid" : "pending",
    paidAt: isPaid ? nowIso : ""
  });

  await loadAP();
  await draw();
}


  function monthRange(year, month){
  const s = new Date(year, month, 1, 0,0,0,0);
  const e = new Date(year, month+1, 0, 23,59,59,999);
  return { s, e };
}

function formatMonthTitle(year, month){
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${nomes[month]} / ${year}`;
}

function drawCalendar(items){
  calTitle.textContent = formatMonthTitle(calYear, calMonth);

  const { s, e } = monthRange(calYear, calMonth);
  const firstDay = new Date(calYear, calMonth, 1, 0,0,0,0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();

  // marca dias com vencimento no mês atual
  const dueMap = new Set(
    items
      .filter(x => x.dueDate && parseISODate(x.dueDate) >= s && parseISODate(x.dueDate) <= e)
      .map(x => x.dueDate)
  );

  const todayISO = toISODate(new Date());
  calGrid.innerHTML = "";

  for (let i=0; i<startWeekday; i++){
    const div = document.createElement("div");
    div.className = "ap-cal-cell empty";
    calGrid.appendChild(div);
  }

  for (let day=1; day<=daysInMonth; day++){
    const iso = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "ap-cal-cell";
    if (iso === todayISO) cell.classList.add("today");
    if (dueMap.has(iso)) cell.classList.add("hasDue");
    if (selectedISO === iso) cell.classList.add("selected");

    cell.innerHTML = `<span class="d">${day}</span><span class="dot"></span>`;

    cell.onclick = () => {
      selectedISO = (selectedISO === iso) ? "" : iso;
      draw();
    };

    calGrid.appendChild(cell);
  }

  calHint.textContent = selectedISO
    ? `Filtrando pelo dia ${selectedISO.split("-").reverse().join("/")}.`
    : `Mostrando o mês inteiro.`;
}

function sortRecentPastThenFuture(a, b){
  const today = dayStart(new Date());
  const da = parseISODate(a.dueDate);
  const db = parseISODate(b.dueDate);

  const aPast = da && da.getTime() <= today.getTime();
  const bPast = db && db.getTime() <= today.getTime();

  if (aPast !== bPast) return aPast ? -1 : 1;

  // passadas/hoje: mais recente primeiro (DESC)
  if (aPast && bPast) return (db?.getTime()||0) - (da?.getTime()||0);

  // futuras: mais próxima primeiro (ASC)
  return (da?.getTime()||0) - (db?.getTime()||0);
}

async function draw(){
  try{
  const all = await loadAP();

  // 1) Calendário sempre mostra o mês atual selecionado
  drawCalendar(all);

  // 2) period = itens do mês do calendário (ou do dia selecionado)
  const { s, e } = monthRange(calYear, calMonth);

  let period = all.filter(x => inRangeDue(x, s, e));

  if (selectedISO){
    period = period.filter(x => x.dueDate === selectedISO);
  }

  // =======================
  // KPIs SEMPRE PELO "HOJE" REAL
  // =======================
  const today = dayStart(new Date());

  const lateAll = all.filter(x => apStatus(x) === "late");
  const dueTodayAll = all.filter(x => apStatus(x) === "today");

  const soon7All = all.filter(x => {
    const st = apStatus(x);
    if (st === "paid" || st === "late") return false;
    const due = parseISODate(x.dueDate);
    if (!due) return false;
    const d = diffDays(today, due);
    return d >= 0 && d <= 7;
  });

  document.getElementById("kApSoon").textContent  = moneyBR(sum(soon7All));
  document.getElementById("kApToday").textContent = moneyBR(sum(dueTodayAll));
  document.getElementById("kApLate").textContent  = moneyBR(sum(lateAll));

  // Pagas no mês (mês do calendário atual)
const { s: ms, e: me } = monthRange(calYear, calMonth);
const paidMonth = all.filter(x => {
  if (apStatus(x) !== "paid") return false;
  const paid = parseISODate(x.paidAt || x.dueDate);
  if (!paid) return false;
  return paid.getTime() >= ms.getTime() && paid.getTime() <= me.getTime();
});

document.getElementById("kApPaidMonth").textContent = moneyBR(sum(paidMonth));


  // =======================
  // ALERTAS + LISTA (baseados no period = mês/dia da tela)
  // =======================
  const alerts = period
    .filter(x => {
      const st = apStatus(x);
      if (st === "late" || st === "today") return true;
      if (st === "paid") return true; // entra como "Paga"

      const due = parseISODate(x.dueDate);
      const d = diffDays(today, due);
      return d >= 0 && d <= 7;
    })
    .sort(sortRecentPastThenFuture);

  apAlertsEl.innerHTML = alerts.length ? alerts.map(x=>{
    const st = apStatus(x);
    const due = parseISODate(x.dueDate);
    const d = diffDays(today, due);
    const hint =
    st === "paid" ? `🟢 Paga` :
      st === "late" ? `🔴 Atrasada (${Math.abs(d)}d)` :
      st === "today" ? `🟠 Vence hoje` :
      `🟡 Vence em ${d}d`;

    return `
      <div class="r-row ap-alert" data-id="${x.id}" style="cursor:default;">

        <div class="t">${hint} • ${x.title} ${apBadge(st)}</div>
        <div class="m">
          Venc: <b>${String(x.dueDate||"").split("-").reverse().join("/")}</b>
          • Valor: <b>${moneyBR(x.amount||0)}</b>
          ${x.category ? `• Cat: <b>${x.category}</b>` : ``}
        </div>
      </div>
    `;
  }).join("") : `<div style="color:#64748b;font-weight:800;">Sem alertas no período.</div>`;


  const list = period.slice().sort(sortRecentPastThenFuture);

 apListEl.innerHTML = list.length ? list.map(x=>{
  const st = apStatus(x);
  const checked = (st === "paid") ? "checked" : "";

  return `
    <div class="r-row ap-item" data-id="${x.id}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="min-width:0;">
        <div class="t">${x.title} ${apBadge(st)}</div>
        <div class="m">
          Venc: <b>${String(x.dueDate||"").split("-").reverse().join("/")}</b>
          • Valor: <b>${moneyBR(x.amount||0)}</b>
          ${x.category ? `• Cat: <b>${x.category}</b>` : ``}
          ${x.supplier ? `• Forn: <b>${x.supplier}</b>` : ``}
        </div>
      </div>

      <label style="display:flex;align-items:center;gap:8px;font-weight:900;color:#334155;white-space:nowrap;">
        <input type="checkbox" class="ap-paid-toggle ap-check" data-id="${x.id}" ${checked}>
        Pago
      </label>
    </div>
  `;
}).join("") : `<div style="color:#64748b;font-weight:800;">Sem contas no período.</div>`;


  apListEl.querySelectorAll(".ap-item").forEach(el=>{
  el.addEventListener("click", (ev)=>{
    // se clicou no checkbox (ou no label dele), não abre modal
    if (ev.target && (ev.target.classList?.contains("ap-paid-toggle") || ev.target.closest?.("label"))) return;

    const id = el.getAttribute("data-id");
    const item = apPayablesCache.find(i => i.id === id);
    if (!item) return;
    openCreateModal(item, { viewOnly: true });

  });
});

// bind dos toggles "Pago"
apListEl.querySelectorAll(".ap-paid-toggle").forEach(chk=>{
  chk.addEventListener("change", ()=>{
    const id = chk.getAttribute("data-id");
    setPaid(id, chk.checked);
  });
});


  // =======================
  // EXPORT (do que está na tela: mês ou dia)
  // =======================
  const headers = ["Status","Vencimento","Descrição","Categoria","Fornecedor","Valor","Pago em","Forma","Obs"];
  const rows = list.map(x=>{
    const st = apStatus(x);
    const paidAt = x.paidAt ? new Date(x.paidAt).toLocaleString("pt-BR") : "";
    return [
      st,
      x.dueDate || "",
      x.title || "",
      x.category || "",
      x.supplier || "",
      Number(x.amount||0).toFixed(2),
      paidAt,
      x.paidMethod || "",
      x.notes || ""
    ];
  });

  const label = selectedISO ? `dia_${selectedISO}` : `mes_${String(calMonth+1).padStart(2,"0")}_${calYear}`;

  document.getElementById("apExportCSV").onclick = ()=>{
    downloadCSV(`contas_a_pagar_${label}`, headers, rows);
  };

  document.getElementById("apExportPDF").onclick = ()=>{
  const sub = selectedISO
    ? `Dia: ${selectedISO.split("-").reverse().join("/")}`
    : `Mês: ${formatMonthTitle(calYear, calMonth)}`;

  openPrintPDF("Contas a pagar", sub, headers, rows);
};

} catch(err){
  console.error(err);
  alert(err?.message || String(err));
}
}
apAdd.onclick = ()=> openCreateModal(null);

calPrev.onclick = () => {
  calMonth--;
  if (calMonth < 0){ calMonth = 11; calYear--; }
  selectedISO = "";
  draw();
};

calNext.onclick = () => {
  calMonth++;
  if (calMonth > 11){ calMonth = 0; calYear++; }
  selectedISO = "";
  draw();
};

calClear.onclick = () => {
  selectedISO = "";
  draw();
};

await draw();

}



function openCupomModal(code, data){
  // data: { total, uses, sales: [{sale, disc}] }

  // Agrupa produtos vendidos com esse cupom
  const itemsMap = new Map(); // key -> {name, qty, total, image}

  for (const row of (data.sales || [])){
    const sale = row.sale || {};
    const items = sale?.meta?.items || sale?.items || [];

    for (const it of items){
      const key = it.id || it.sku || it.barcode || it.name || "—";
      const cur = itemsMap.get(key) || {
        name: it.name || key,
        qty: 0,
        total: 0,
        image: it.imageData || it.photo || it.image || it.img || ""
      };

      const qty = Number(it.qty || 0);
      const price = Number(it.price || 0);
      cur.qty += qty;
      cur.total += (qty * price);

      itemsMap.set(key, cur);
    }
  }

  const itemsArr = [...itemsMap.values()].sort((a,b)=>b.total-a.total);

  openModal(`Cupom: ${code}`, `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <div style="font-weight:950;color:#0f172a;font-size:16px;">
          Total concedido: ${moneyBR(data.total || 0)}
        </div>
        <div style="margin-top:6px;color:#334155;font-weight:900;font-size:12px;">
          Vendas: <b>${data.uses || 0}</b>
        </div>
      </div>

      <div style="text-align:right;">
        <div style="color:#64748b;font-weight:900;font-size:12px;">Produtos (ranking)</div>
        <div style="margin-top:6px;color:#334155;font-weight:900;font-size:12px;">
          Itens diferentes: <b>${itemsArr.length}</b>
        </div>
      </div>
    </div>

    <div class="hr" style="margin:12px 0;"></div>

    <div style="display:grid;gap:10px;">
      ${
        itemsArr.length
          ? itemsArr.map(p => `
              <div style="
                display:grid;
                grid-template-columns:48px 1fr auto;
                gap:12px;
                align-items:center;
                padding:10px;
                border:1px solid #e5e7eb;
                border-radius:14px;
                background:#fff;
              ">
                <div style="
                  width:48px;height:48px;border-radius:14px;
                  overflow:hidden;display:flex;align-items:center;justify-content:center;
                  background:#f1f5f9;color:#94a3b8;font-weight:950;
                ">
                  ${
                    p.image
                      ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;display:block;">`
                      : `IMG`
                  }
                </div>

                <div>
                  <div style="font-weight:950;color:#0f172a;">${String(p.name || "—")}</div>
                  <div style="margin-top:4px;color:#64748b;font-weight:800;font-size:12px;">
                    Qtd: <b>${p.qty}</b>
                  </div>
                </div>

                <div style="text-align:right;font-weight:950;color:#0f172a;">
                  ${moneyBR(p.total || 0)}
                </div>
              </div>
            `).join("")
          : `<div style="color:#64748b;font-weight:900;">Sem produtos no período.</div>`
      }
    </div>

    <div class="hr" style="margin:12px 0;"></div>

    <div style="font-weight:950;color:#0f172a;">Vendas com esse cupom</div>
    <div style="display:grid;gap:10px;margin-top:10px;">
      ${
        (data.sales || [])
          .slice()
          .sort((a,b)=> new Date(b.sale.at || b.sale.createdAt) - new Date(a.sale.at || a.sale.createdAt))
          .map(({sale, disc})=>{
            const when = new Date(sale.at || sale.createdAt).toLocaleString("pt-BR");
            const saleId = sale.saleId || sale.id || "—";
            const operator = sale.by || sale.operator || "—";

            return `
              <div style="
                border:1px solid #e5e7eb;border-radius:14px;
                padding:10px;background:#fff;
                display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;
              ">
                <div>
                  <div style="font-weight:950;">${when}</div>
                  <div style="color:#64748b;font-weight:800;font-size:12px;">Venda: ${saleId}</div>
                  <div style="color:#64748b;font-weight:800;font-size:12px;">Operador: ${operator}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:950;">Total: ${moneyBR(sale.total || 0)}</div>
                  <div style="color:#64748b;font-weight:800;font-size:12px;">Desconto: ${moneyBR(disc || 0)}</div>
                </div>
              </div>
            `;
          }).join("")
      }
    </div>
  `);
}

async function loadProductsForStockValue(){
  try{
    if (window.ProductsStore?.list){
      return await window.ProductsStore.list({
        limit: 5000,
        orderBy: "name",
        ascending: true
      });
    }

    if (window.CoreProducts?.list){
      return await window.CoreProducts.list();
    }

    if (window.CoreInventory?.getProducts){
      return window.CoreInventory.getProducts();
    }

    const local = JSON.parse(localStorage.getItem("core.products.v1") || "[]");
    if (Array.isArray(local) && local.length) return local;

    const sb =
      window.sb ||
      window.supabase ||
      window.supabaseClient ||
      window.CoreSupabase ||
      window.coreSupabase ||
      null;

    if (sb?.from){
      const { data, error } = await sb
        .from("products")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      return Array.isArray(data) ? data : [];
    }

    return [];
  }catch(err){
    console.error("[VALOR ESTOQUE] erro ao carregar produtos:", err);
    return [];
  }
}

function getProductStockQty(p){
  return Number(
    p.stockOnHand ??
    p.stock_on_hand ??
    p.stock ??
    p.qty ??
    p.quantity ??
    0
  ) || 0;
}

function getProductCostValue(p){
  if (p.costCents != null) return Number(p.costCents || 0) / 100;
  if (p.cost_cents != null) return Number(p.cost_cents || 0) / 100;

  return Number(
    p.cost ??
    p.costPrice ??
    p.cost_price ??
    p.purchasePrice ??
    p.purchase_price ??
    0
  ) || 0;
}

function getProductName(p){
  return p.name || p.title || p.description || p.product_name || "Produto sem nome";
}

function getProductSku(p){
  return p.sku || p.barcode || p.code || p.id || "—";
}

function getProductCategory(p){
  return p.cat || p.category || p.category_name || p.group || "Sem categoria";
}

async function renderValorEstoque(){
  content.innerHTML = `
    <div class="r-card">
      <div class="r-head">
        <div>
          <div class="r-title"><span class="ico">📦</span> Valor de Estoque</div>
          <div class="r-sub">Valor financeiro do estoque atual com base no custo cadastrado dos produtos.</div>
        </div>

        <div class="r-filters">
          <button class="r-btn" id="veExportCSV">CSV</button>
          <button class="r-btn" id="veExportPDF">PDF</button>
        </div>
      </div>

      <div class="r-kpis">
        <div class="r-kpi r-kpi-highlight">
          <div class="k">Valor total em estoque</div>
          <div class="v" id="veTotal">—</div>
        </div>

        <div class="r-kpi">
          <div class="k">Produtos diferentes</div>
          <div class="v" id="veProdutos">—</div>
        </div>

        <div class="r-kpi">
          <div class="k">Quantidade total</div>
          <div class="v" id="veQtd">—</div>
        </div>

        <div class="r-kpi">
          <div class="k">Maior valor em estoque</div>
          <div class="v" id="veMaior">—</div>
        </div>
      </div>

      <div class="hr" style="margin:12px 0;"></div>

      <div id="veList" style="display:grid;gap:10px;"></div>
    </div>
  `;

  const products = await loadProductsForStockValue();

  const rows = products
    .map(p => {
      const qty = getProductStockQty(p);
      const cost = getProductCostValue(p);
      const total = qty * cost;

      return {
        name: getProductName(p),
        sku: getProductSku(p),
        category: getProductCategory(p),
        qty,
        cost,
        total
      };
    })
    .filter(p => p.qty > 0)
    .sort((a,b) => b.total - a.total);

  const totalValue = rows.reduce((acc, p) => acc + p.total, 0);
  const totalQty = rows.reduce((acc, p) => acc + p.qty, 0);
  const maior = rows[0];

  document.getElementById("veTotal").textContent = moneyBR(totalValue);
  document.getElementById("veProdutos").textContent = String(rows.length);
  document.getElementById("veQtd").textContent = String(totalQty);
  document.getElementById("veMaior").textContent = maior ? moneyBR(maior.total) : "—";

  const veList = document.getElementById("veList");

  if (!rows.length){
    veList.innerHTML = `
      <div style="color:#64748b;font-weight:800;">
        Nenhum produto com estoque positivo encontrado.
      </div>
    `;
    return;
  }

  veList.innerHTML = rows.map((p, idx) => `
    <div class="r-row" style="cursor:default;">
      <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;">
        <div style="min-width:0;">
          <div class="t">${idx + 1}º • ${p.name}</div>
          <div class="m">
            SKU: <b>${p.sku}</b>
            • Categoria: <b>${p.category}</b>
            • Qtd: <b>${p.qty}</b>
            • Custo un.: <b>${moneyBR(p.cost)}</b>
          </div>
        </div>

        <div style="font-weight:950;color:#0f172a;white-space:nowrap;">
          ${moneyBR(p.total)}
        </div>
      </div>
    </div>
  `).join("");

  const headers = ["Produto", "SKU", "Categoria", "Qtd em estoque", "Custo unitário", "Valor total"];
  const exportRows = rows.map(p => [
    p.name,
    p.sku,
    p.category,
    p.qty,
    n2(p.cost),
    n2(p.total)
  ]);

  document.getElementById("veExportCSV").onclick = () => {
    downloadCSV("valor_estoque_atual", headers, exportRows);
  };

  document.getElementById("veExportPDF").onclick = () => {
    openPrintPDF(
      "Valor de Estoque",
      `Estoque atual • Total: ${moneyBR(totalValue)} • Produtos: ${rows.length}`,
      headers,
      exportRows
    );
  };
}


  // ===== menu =====
 document.querySelectorAll(".report-tile").forEach(btn => {
  btn.addEventListener("click", () => {
    const view = btn.getAttribute("data-view");

    window.CoreRouterState = window.CoreRouterState || {};
    window.CoreRouterState.reportsInitialView = view;

    if (view === "dashboard") {
      window.setActiveSidebar?.("relatorios");
      renderDashboard();
    }
    else if (view === "vendas") {
      window.setActiveSidebar?.("relatorios");
      renderVendas();
    }
    else if (view === "vendedores") {
      window.setActiveSidebar?.("relatorios");
      renderVendedores();
    }
    else if (view === "produtos") {
      window.setActiveSidebar?.("relatorios");
      renderProdutos();
    }
    else if (view === "clientes") {
      window.setActiveSidebar?.("relatorios");
      renderClientes();
    }
    else if (view === "estoque") {
      window.setActiveSidebar?.("relatorios");
      renderEstoque();
    }
    else if (view === "cupons") {
      window.setActiveSidebar?.("relatorios");
      renderCupons();
    }
    else if (view === "valorEstoque") {
  window.setActiveSidebar?.("relatorios");
  renderValorEstoque();
}
    else if (view === "resultado") {
      window.setActiveSidebar?.("relatorios");
      renderResultado();
    }
    else {
      window.setActiveSidebar?.("relatorios");
      renderPlaceholder("Escolha um relatório", "Clique em um card acima para abrir.");
    }
  });
});

const initialView = window.CoreRouterState?.reportsInitialView || "";
window.CoreRouterState.reportsInitialView = "";

window.setActiveSidebar?.("relatorios");
renderPlaceholder("Escolha um relatório", "Clique em um card acima para abrir.");
};
