// Aba "Gráficos": receitas x despesas, saldo, categorias, investimentos e estatísticas anuais

// Tema escuro: troca as cores padrão do Chart.js (texto/linhas escuras
// por padrão, invisíveis no fundo escuro do app).
Chart.defaults.color = '#9aa0aa';
Chart.defaults.borderColor = '#35373d';

let monthlyChart = null;
let balanceLineChart = null;
let chartsCategoryChart = null;
let chartsIncomeCategoryChart = null;
let investmentsChart = null;
let yearlyChart = null;

const chartsCustomRangeToggle = document.getElementById('charts-custom-range-toggle');
const chartsRangeStart = document.getElementById('charts-range-start');
const chartsRangeEnd = document.getElementById('charts-range-end');
const chartsGranularity = document.getElementById('charts-granularity');

chartsCustomRangeToggle.addEventListener('change', () => {
  document.getElementById('charts-month-picker').classList.toggle('hidden', chartsCustomRangeToggle.checked);
  document.getElementById('charts-range-picker').classList.toggle('hidden', !chartsCustomRangeToggle.checked);

  if (chartsCustomRangeToggle.checked && !chartsRangeStart.value && !chartsRangeEnd.value) {
    const { startISO } = monthRange(AppState.selectedMonth);
    chartsRangeStart.value = startISO;
    chartsRangeEnd.value = toISODate(new Date());
  }

  renderChartsSection();
});
chartsRangeStart.addEventListener('change', renderChartsSection);
chartsRangeEnd.addEventListener('change', renderChartsSection);
chartsGranularity.addEventListener('change', renderChartsSection);

async function renderChartsSection() {
  const granularity = chartsGranularity.value;
  const usingCustomRange = chartsCustomRangeToggle.checked && chartsRangeStart.value && chartsRangeEnd.value;

  let trendData, trendSuffix;

  if (usingCustomRange) {
    if (granularity === 'week') {
      trendData = await fetchWeeklyDataRange(chartsRangeStart.value, chartsRangeEnd.value);
      trendSuffix = 'no período selecionado (por semana)';
    } else {
      trendData = await fetchDailyDataRange(chartsRangeStart.value, chartsRangeEnd.value);
      trendSuffix = 'no período selecionado (por dia)';
    }
  } else if (granularity === 'day') {
    trendData = await fetchDailyData(new Date(), 14);
    trendSuffix = 'últimos 14 dias';
  } else if (granularity === 'week') {
    trendData = await fetchWeeklyData(new Date(), 8);
    trendSuffix = 'últimas 8 semanas';
  } else {
    trendData = await fetchSixMonthData(AppState.selectedMonth);
    trendSuffix = 'últimos 6 meses';
  }

  document.getElementById('monthly-chart-title').textContent = `Receitas x Despesas — ${trendSuffix}`;
  document.getElementById('balance-chart-title').textContent = `Evolução do saldo — ${trendSuffix}`;

  renderMonthlyChart(trendData);
  renderBalanceLineChart(trendData);

  const categoryPeriodLabel = usingCustomRange ? 'no período' : 'no mês';
  document.getElementById('charts-category-title').textContent = `Gastos por categoria ${categoryPeriodLabel}`;
  document.getElementById('charts-income-category-title').textContent = `Receitas por categoria ${categoryPeriodLabel}`;

  await renderChartsCategoryChart();
  await renderIncomeCategoryChart();
  await renderInvestmentsChart();
  await renderYearlyStats();
}

async function fetchSixMonthData(endMonth) {
  const startMonth = addMonthsClamped(endMonth, -5);
  const { startISO } = monthRange(startMonth);
  const { endISO } = monthRange(endMonth);

  const { data, error } = await supabaseClient
    .from('transactions')
    .select('date, type, amount')
    .gte('date', startISO)
    .lt('date', endISO);

  const months = Array.from({ length: 6 }, (_, i) => addMonthsClamped(endMonth, -(5 - i)));
  const incomeByBucket = months.map(() => 0);
  const expenseByBucket = months.map(() => 0);

  if (!error && data) {
    data.forEach((tx) => {
      const txDate = new Date(tx.date + 'T00:00:00');
      const idx = months.findIndex(
        (m) => m.getFullYear() === txDate.getFullYear() && m.getMonth() === txDate.getMonth()
      );
      if (idx === -1) return;
      if (tx.type === 'receita') incomeByBucket[idx] += Number(tx.amount);
      else expenseByBucket[idx] += Number(tx.amount);
    });
  }

  const labels = months.map((m) => monthLabel(m).slice(0, 3));
  return { labels, incomeByBucket, expenseByBucket };
}

async function fetchDailyData(endDate, days) {
  const dayList = Array.from({ length: days }, (_, i) => {
    const d = new Date(endDate);
    d.setDate(d.getDate() - (days - 1 - i));
    return d;
  });

  const startISO = toISODate(dayList[0]);
  const endExclusive = new Date(dayList[dayList.length - 1]);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const { data, error } = await supabaseClient
    .from('transactions')
    .select('date, type, amount')
    .gte('date', startISO)
    .lt('date', toISODate(endExclusive));

  const incomeByBucket = dayList.map(() => 0);
  const expenseByBucket = dayList.map(() => 0);

  if (!error && data) {
    data.forEach((tx) => {
      const idx = dayList.findIndex((d) => toISODate(d) === tx.date);
      if (idx === -1) return;
      if (tx.type === 'receita') incomeByBucket[idx] += Number(tx.amount);
      else expenseByBucket[idx] += Number(tx.amount);
    });
  }

  const labels = dayList.map((d) => formatDateBR(toISODate(d)).slice(0, 5));
  return { labels, incomeByBucket, expenseByBucket };
}

async function fetchWeeklyData(endDate, weeks) {
  const lastWeekStart = startOfWeek(endDate);
  const weekStarts = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(lastWeekStart);
    d.setDate(d.getDate() - (weeks - 1 - i) * 7);
    return d;
  });

  const startISO = toISODate(weekStarts[0]);
  const endExclusive = new Date(lastWeekStart);
  endExclusive.setDate(endExclusive.getDate() + 7);

  const { data, error } = await supabaseClient
    .from('transactions')
    .select('date, type, amount')
    .gte('date', startISO)
    .lt('date', toISODate(endExclusive));

  const incomeByBucket = weekStarts.map(() => 0);
  const expenseByBucket = weekStarts.map(() => 0);

  if (!error && data) {
    data.forEach((tx) => {
      const txDate = new Date(tx.date + 'T00:00:00');
      const wStart = toISODate(startOfWeek(txDate));
      const idx = weekStarts.findIndex((w) => toISODate(w) === wStart);
      if (idx === -1) return;
      if (tx.type === 'receita') incomeByBucket[idx] += Number(tx.amount);
      else expenseByBucket[idx] += Number(tx.amount);
    });
  }

  const labels = weekStarts.map((d) => formatDateBR(toISODate(d)).slice(0, 5));
  return { labels, incomeByBucket, expenseByBucket };
}

// Bucketa por dia um intervalo exato (período personalizado), limitando a
// 90 dias pra não gerar um gráfico ilegível quando o período for muito longo.
async function fetchDailyDataRange(startISO, endISO) {
  const start = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  return fetchDailyData(end, Math.min(days, 90));
}

// Igual, mas bucketa por semana (segunda a domingo), limitando a 52 semanas.
async function fetchWeeklyDataRange(startISO, endISO) {
  const start = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  const weeks = Math.max(1, Math.ceil((end - start) / (7 * 86400000)) + 1);
  return fetchWeeklyData(end, Math.min(weeks, 52));
}

function renderMonthlyChart({ labels, incomeByBucket, expenseByBucket }) {
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(document.getElementById('monthly-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Receitas', data: incomeByBucket, backgroundColor: '#16a34a' },
        { label: 'Despesas', data: expenseByBucket, backgroundColor: '#dc2626' },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function renderBalanceLineChart({ labels, incomeByBucket, expenseByBucket }) {
  let running = 0;
  const cumulativeBalance = incomeByBucket.map((income, i) => {
    running += income - expenseByBucket[i];
    return running;
  });

  if (balanceLineChart) balanceLineChart.destroy();
  balanceLineChart = new Chart(document.getElementById('balance-line-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Saldo acumulado',
          data: cumulativeBalance,
          borderColor: '#6366f1',
          backgroundColor: '#6366f122',
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatBRL(ctx.raw) } },
      },
    },
  });
}

async function renderCategoryPie(canvasId, emptyId, type) {
  const usingCustomRange = chartsCustomRangeToggle.checked && chartsRangeStart.value && chartsRangeEnd.value;
  let transactions;
  if (usingCustomRange) {
    transactions = await fetchTransactionsInclusive(chartsRangeStart.value, chartsRangeEnd.value);
  } else {
    const { startISO, endISO } = monthRange(AppState.selectedMonth);
    transactions = await fetchTransactions(startISO, endISO);
  }

  const filtered = transactions.filter((t) => t.type === type);

  const totals = {};
  filtered.forEach((t) => {
    const cat = findCategory(t.category_id);
    const key = cat ? cat.name : 'Sem categoria';
    totals[key] = (totals[key] || 0) + Number(t.amount);
  });

  const labels = Object.keys(totals);
  const values = Object.values(totals);
  const colors = labels.map((name) => {
    const cat = AppState.categories.find((c) => c.name === name);
    return cat ? cat.color : '#6b7280';
  });

  const canvas = document.getElementById(canvasId);
  const emptyMsg = document.getElementById(emptyId);
  emptyMsg.classList.toggle('hidden', labels.length > 0);
  canvas.classList.toggle('hidden', labels.length === 0);

  return { canvas, labels, values, colors };
}

async function renderChartsCategoryChart() {
  const { canvas, labels, values, colors } = await renderCategoryPie(
    'charts-category-chart',
    'charts-category-empty',
    'despesa'
  );

  if (chartsCategoryChart) chartsCategoryChart.destroy();
  if (labels.length === 0) return;

  chartsCategoryChart = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatBRL(ctx.raw)}` } },
      },
    },
  });
}

async function renderIncomeCategoryChart() {
  const { canvas, labels, values, colors } = await renderCategoryPie(
    'charts-income-category-chart',
    'charts-income-category-empty',
    'receita'
  );

  if (chartsIncomeCategoryChart) chartsIncomeCategoryChart.destroy();
  if (labels.length === 0) return;

  chartsIncomeCategoryChart = new Chart(canvas, {
    type: 'pie',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatBRL(ctx.raw)}` } },
      },
    },
  });
}

async function renderInvestmentsChart() {
  const { data, error } = await supabaseClient.from('investments').select('*').order('date');
  const list = !error && data ? data : [];

  const canvas = document.getElementById('investments-chart');
  const emptyMsg = document.getElementById('charts-investments-empty');
  emptyMsg.classList.toggle('hidden', list.length > 0);
  canvas.classList.toggle('hidden', list.length === 0);

  if (investmentsChart) investmentsChart.destroy();
  if (list.length === 0) return;

  investmentsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: list.map((i) => i.name),
      datasets: [
        { label: 'Investido', data: list.map((i) => Number(i.amount_invested)), backgroundColor: '#6366f1' },
        { label: 'Valor atual', data: list.map((i) => Number(i.current_value)), backgroundColor: '#16a34a' },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

async function renderYearlyStats() {
  const year = AppState.selectedYear;
  const startISO = `${year}-01-01`;
  const endISO = `${year + 1}-01-01`;

  const { data, error } = await supabaseClient
    .from('transactions')
    .select('date, type, amount')
    .gte('date', startISO)
    .lt('date', endISO);

  const transactions = !error && data ? data : [];

  const incomeByMonth = Array(12).fill(0);
  const expenseByMonth = Array(12).fill(0);

  transactions.forEach((tx) => {
    const monthIndex = Number(tx.date.slice(5, 7)) - 1;
    if (tx.type === 'receita') incomeByMonth[monthIndex] += Number(tx.amount);
    else expenseByMonth[monthIndex] += Number(tx.amount);
  });

  const totalIncome = incomeByMonth.reduce((a, b) => a + b, 0);
  const totalExpense = expenseByMonth.reduce((a, b) => a + b, 0);

  document.getElementById('year-stat-income').textContent = formatBRL(totalIncome);
  document.getElementById('year-stat-expense').textContent = formatBRL(totalExpense);
  const balanceEl = document.getElementById('year-stat-balance');
  balanceEl.textContent = formatBRL(totalIncome - totalExpense);
  balanceEl.className = 'stat-value ' + (totalIncome - totalExpense >= 0 ? 'positive' : 'negative');

  const monthLabels = Array.from({ length: 12 }, (_, i) => monthLabel(new Date(year, i, 1)).slice(0, 3));

  if (yearlyChart) yearlyChart.destroy();
  yearlyChart = new Chart(document.getElementById('yearly-chart'), {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [
        { label: 'Receitas', data: incomeByMonth, backgroundColor: '#16a34a' },
        { label: 'Despesas', data: expenseByMonth, backgroundColor: '#dc2626' },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } },
    },
  });
}
