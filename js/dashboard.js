// Visão Geral: totais do mês, gráfico por categoria e últimas transações

let categoryChart = null;

async function renderOverview() {
  const { startISO, endISO } = monthRange(AppState.selectedMonth);
  const transactions = await fetchTransactions(startISO, endISO);

  const income = transactions.filter((t) => t.type === 'receita').reduce((s, t) => s + Number(t.amount), 0);
  const expense = transactions.filter((t) => t.type === 'despesa').reduce((s, t) => s + Number(t.amount), 0);

  document.getElementById('stat-income').textContent = formatBRL(income);
  document.getElementById('stat-expense').textContent = formatBRL(expense);
  const balanceEl = document.getElementById('stat-balance');
  balanceEl.textContent = formatBRL(income - expense);
  balanceEl.className = 'stat-value ' + (income - expense >= 0 ? 'positive' : 'negative');

  renderCategoryChart(transactions.filter((t) => t.type === 'despesa'));
  renderRecentTransactions();
}

function renderCategoryChart(expenseTransactions) {
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

  const canvas = document.getElementById('category-chart');
  const emptyMsg = document.getElementById('chart-empty');
  emptyMsg.classList.toggle('hidden', labels.length > 0);
  canvas.classList.toggle('hidden', labels.length === 0);

  if (categoryChart) categoryChart.destroy();
  if (labels.length === 0) return;

  categoryChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${formatBRL(ctx.raw)}`,
          },
        },
      },
    },
  });
}

async function renderRecentTransactions() {
  const { data, error } = await supabaseClient
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5);

  const list = document.getElementById('recent-list');
  list.innerHTML = '';

  if (error || !data || data.length === 0) {
    list.innerHTML = '<li class="empty-msg">Nenhuma transação ainda.</li>';
    return;
  }

  data.forEach((tx) => list.appendChild(renderRecentTxItem(tx)));
}
