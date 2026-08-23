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

async function renderChartsSection() {
  const sixMonthData = await fetchSixMonthData(AppState.selectedMonth);
  renderMonthlyChart(sixMonthData);
  renderBalanceLineChart(sixMonthData);
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
  const incomeByMonth = months.map(() => 0);
  const expenseByMonth = months.map(() => 0);

  if (!error && data) {
    data.forEach((tx) => {
      const txDate = new Date(tx.date + 'T00:00:00');
      const idx = months.findIndex(
        (m) => m.getFullYear() === txDate.getFullYear() && m.getMonth() === txDate.getMonth()
      );
      if (idx === -1) return;
      if (tx.type === 'receita') incomeByMonth[idx] += Number(tx.amount);
      else expenseByMonth[idx] += Number(tx.amount);
    });
  }

  const labels = months.map((m) => monthLabel(m).slice(0, 3));
  return { labels, incomeByMonth, expenseByMonth };
}

function renderMonthlyChart({ labels, incomeByMonth, expenseByMonth }) {
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(document.getElementById('monthly-chart'), {
    type: 'bar',
    data: {
      labels,
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

function renderBalanceLineChart({ labels, incomeByMonth, expenseByMonth }) {
  let running = 0;
  const cumulativeBalance = incomeByMonth.map((income, i) => {
    running += income - expenseByMonth[i];
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
  const { startISO, endISO } = monthRange(AppState.selectedMonth);
  const transactions = await fetchTransactions(startISO, endISO);
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
