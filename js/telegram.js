// Vínculo da conta com o bot do Telegram — seção "Telegram"

async function renderTelegramSection() {
  const { data, error } = await supabaseClient
    .from('telegram_links')
    .select('*')
    .eq('user_id', AppState.user.id)
    .maybeSingle();

  const linkedPanel = document.getElementById('telegram-linked-panel');
  const unlinkedPanel = document.getElementById('telegram-unlinked-panel');

  if (!error && data) {
    linkedPanel.classList.remove('hidden');
    unlinkedPanel.classList.add('hidden');
    document.getElementById('telegram-linked-info').textContent = data.telegram_username
      ? `Vinculado ao Telegram como @${data.telegram_username}.`
      : 'Sua conta está vinculada ao Telegram.';
  } else {
    linkedPanel.classList.add('hidden');
    unlinkedPanel.classList.remove('hidden');
    document.getElementById('telegram-code-display').classList.add('hidden');
  }
}

document.getElementById('telegram-generate-code-btn').addEventListener('click', async () => {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabaseClient
    .from('telegram_link_codes')
    .insert({ code, user_id: AppState.user.id, expires_at: expiresAt });

  if (error) {
    alert('Não foi possível gerar o código: ' + error.message);
    return;
  }

  document.getElementById('telegram-code-value').textContent = code;
  document.getElementById('telegram-code-display').classList.remove('hidden');
});

document.getElementById('telegram-unlink-btn').addEventListener('click', async () => {
  if (!confirm('Desvincular sua conta do Telegram? Você pode vincular de novo depois.')) return;

  const { error } = await supabaseClient
    .from('telegram_links')
    .delete()
    .eq('user_id', AppState.user.id);

  if (error) {
    alert('Não foi possível desvincular: ' + error.message);
    return;
  }

  renderTelegramSection();
});
