// Estado compartilhado e inicialização geral do app (app.html)

const AppState = {
  user: null,
  categories: [], // todas as categorias do usuário (despesa + receita)
  recurring: [], // recorrências ativas/pausadas
  selectedMonth: startOfMonth(new Date()), // mês exibido em Visão Geral, Transações e Gráficos
  selectedYear: new Date().getFullYear(), // ano exibido nas Estatísticas anuais (aba Gráficos)
};

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { startISO: toISODate(start), endISO: toISODate(end) };
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function monthLabel(date) {
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatBRL(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// Soma meses a uma data "clampando" o dia (ex: 31/01 + 1 mês vira 28ou29/02, não estoura pra março)
function addMonthsClamped(date, monthsToAdd) {
  const targetMonthIndex = date.getMonth() + monthsToAdd;
  const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const day = Math.min(date.getDate(), daysInTargetMonth);
  return new Date(targetYear, normalizedMonth, day);
}

function updateMonthLabels() {
  const label = monthLabel(AppState.selectedMonth);
  document.getElementById('current-month-label').textContent = label;
  document.getElementById('tx-month-label').textContent = label;
  document.getElementById('charts-month-label').textContent = label;
}

async function changeMonth(delta) {
  const d = AppState.selectedMonth;
  AppState.selectedMonth = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  updateMonthLabels();
  if (typeof ensureRecurringOccurrences === 'function') {
    await ensureRecurringOccurrences(AppState.selectedMonth);
  }
  refreshMonthDependentViews();
}

function changeYear(delta) {
  AppState.selectedYear += delta;
  document.getElementById('charts-year-label').textContent = String(AppState.selectedYear);
  if (typeof renderYearlyStats === 'function') renderYearlyStats();
}

function refreshMonthDependentViews() {
  if (typeof renderOverview === 'function') renderOverview();
  if (typeof renderTransactionsSection === 'function') renderTransactionsSection();
  const chartsSection = document.getElementById('section-charts');
  if (chartsSection.classList.contains('active') && typeof renderChartsSection === 'function') {
    renderChartsSection();
  }
}

// --- Navegação entre seções ---
document.getElementById('main-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;

  document.querySelectorAll('#main-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  document.getElementById('section-' + btn.dataset.section).classList.add('active');

  if (btn.dataset.section === 'charts' && typeof renderChartsSection === 'function') {
    renderChartsSection();
  }
});

document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
document.getElementById('tx-prev-month').addEventListener('click', () => changeMonth(-1));
document.getElementById('tx-next-month').addEventListener('click', () => changeMonth(1));
document.getElementById('charts-prev-month').addEventListener('click', () => changeMonth(-1));
document.getElementById('charts-next-month').addEventListener('click', () => changeMonth(1));
document.getElementById('charts-prev-year').addEventListener('click', () => changeYear(-1));
document.getElementById('charts-next-year').addEventListener('click', () => changeYear(1));

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
});

// --- Inicialização ---
async function initApp() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = 'index.html';
    return;
  }
  AppState.user = data.session.user;
  document.getElementById('user-email').textContent = AppState.user.email;

  const today = toISODate(new Date());
  document.getElementById('tx-date').value = today;
  document.getElementById('inv-date').value = today;
  document.getElementById('rec-start-date').value = today;

  updateMonthLabels();
  document.getElementById('charts-year-label').textContent = String(AppState.selectedYear);

  await loadCategories();
  await loadRecurring();

  // Gera as recorrências do mês atual e dos 2 próximos, pra já aparecerem
  // sem precisar navegar manualmente até lá.
  await ensureRecurringOccurrences(AppState.selectedMonth);
  await ensureRecurringOccurrences(addMonthsClamped(AppState.selectedMonth, 1));
  await ensureRecurringOccurrences(addMonthsClamped(AppState.selectedMonth, 2));

  await Promise.all([renderOverview(), renderTransactionsSection(), loadInvestments()]);
}

// Só inicia depois que todos os <script> da página (categories.js, transactions.js,
// investments.js, dashboard.js, recurring.js, charts.js) já executaram — evita chamar
// funções que ainda não existem.
document.addEventListener('DOMContentLoaded', initApp);
