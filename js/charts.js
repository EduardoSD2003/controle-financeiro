// Aba "Gráficos": receitas x despesas, gastos por categoria e investido x valor atual

let monthlyChart = null;
let chartsCategoryChart = null;
let investmentsChart = null;

async function renderChartsSection() {
  await renderMonthlyChart();
  await renderChartsCategoryChart();
  await renderInvestmentsChart();
}

async function renderMonthlyChart() {
  const endMonth = AppState.selectedMonth;
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

async function renderChartsCategoryChart() {
  const { startISO, endISO } = monthRange(AppState.selectedMonth);
  const transactions = await fetchTransactions(startISO, endISO);
  const expenseTransactions = transactions.filter((t) => t.type === 'despesa');

  const totals = {};
  expenseTransactions.forEach((t) => {
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

  const canvas = document.getElementById('charts-category-chart');
  const emptyMsg = document.getElementById('charts-category-empty');
  emptyMsg.classList.toggle('hidden', labels.length > 0);
  canvas.classList.toggle('hidden', labels.length === 0);

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
