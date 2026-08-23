// Edge Function: recebe as mensagens do bot do Telegram e conduz o fluxo de
// perguntas (tipo → categoria → valor → parcelamento → descrição →
// confirmação) pra lançar transações na conta do usuário vinculado.
//
// Variáveis de ambiente (Project Settings → Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN         token dado pelo @BotFather
//   TELEGRAM_WEBHOOK_SECRET    uma string aleatória sua, usada só pra
//                              confirmar que a chamada veio mesmo do Telegram
//   SUPABASE_URL               já vem pronta no ambiente da função
//   SUPABASE_SERVICE_ROLE_KEY  Project Settings → API → service_role
//                              (secreta — nunca usar essa chave no site)

import { createClient } from 'npm:@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const DEFAULT_ICON: Record<string, string> = { despesa: '💰', receita: '➕' };
const DEFAULT_COLOR = '#6366f1';

function brl(value: number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Soma meses a uma data "clampando" o dia (ex: 31/01 + 1 mês vira 28/02).
function addMonthsClamped(date: Date, monthsToAdd: number) {
  const targetMonthIndex = date.getMonth() + monthsToAdd;
  const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const day = Math.min(date.getDate(), daysInTargetMonth);
  return new Date(targetYear, normalizedMonth, day);
}

async function callTelegram(method: string, payload: unknown) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error('Telegram API error', method, await res.text());
  }
}

function sendMessage(chatId: number, text: string, replyMarkup?: unknown) {
  return callTelegram('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup });
}

function answerCallbackQuery(id: string, text?: string) {
  return callTelegram('answerCallbackQuery', { callback_query_id: id, text });
}

// --- Estado da conversa (uma linha por usuário do Telegram) ---

async function getConversation(telegramUserId: number) {
  const { data } = await supabase
    .from('telegram_conversations')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();
  return data;
}

async function setConversation(telegramUserId: number, userId: string, step: string, draft: Record<string, unknown>) {
  await supabase.from('telegram_conversations').upsert({
    telegram_user_id: telegramUserId,
    user_id: userId,
    step,
    draft,
    updated_at: new Date().toISOString(),
  });
}

async function clearConversation(telegramUserId: number) {
  await supabase.from('telegram_conversations').delete().eq('telegram_user_id', telegramUserId);
}

async function getLinkedUser(telegramUserId: number) {
  const { data } = await supabase
    .from('telegram_links')
    .select('user_id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();
  return data ? (data.user_id as string) : null;
}

async function tryLinkAccount(telegramUserId: number, username: string | undefined, code: string) {
  const { data: codeRow } = await supabase
    .from('telegram_link_codes')
    .select('*')
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!codeRow) return false;

  // Remove qualquer vínculo anterior dessa conta do Telegram ou dessa conta
  // do app, pra nunca esbarrar nas constraints de unicidade das duas colunas.
  await supabase.from('telegram_links').delete().eq('telegram_user_id', telegramUserId);
  await supabase.from('telegram_links').delete().eq('user_id', codeRow.user_id);

  await supabase.from('telegram_links').insert({
    telegram_user_id: telegramUserId,
    user_id: codeRow.user_id,
    telegram_username: username || null,
  });
  await supabase.from('telegram_link_codes').delete().eq('user_id', codeRow.user_id);
  return true;
}

// --- Fluxo da conversa ---

async function startWizard(telegramUserId: number, userId: string, chatId: number) {
  await setConversation(telegramUserId, userId, 'AWAITING_TYPE', {});
  await sendMessage(chatId, 'Vamos lançar uma transação. É despesa ou receita?', {
    inline_keyboard: [
      [
        { text: '💸 Despesa', callback_data: 'type:despesa' },
        { text: '💰 Receita', callback_data: 'type:receita' },
      ],
    ],
  });
}

function categoryKeyboard(categories: { id: string; name: string; icon: string }[]) {
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    rows.push(
      categories.slice(i, i + 2).map((c) => ({ text: `${c.icon} ${c.name}`, callback_data: `cat:${c.id}` }))
    );
  }
  rows.push([{ text: '➕ Nova categoria', callback_data: 'cat:new' }]);
  return { inline_keyboard: rows };
}

async function sendConfirmation(chatId: number, draft: Record<string, any>) {
  const totalLabel = draft.installment_total > 1 ? `, em ${draft.installment_total}x de ${brl(draft.amount)}` : '';
  const text =
    `Confirma?\n\n` +
    `${draft.type === 'despesa' ? 'Despesa' : 'Receita'} de ${brl(draft.amount)}${totalLabel}\n` +
    `Categoria: ${draft.category_label}\n` +
    `Descrição: ${draft.description || '(sem descrição)'}`;

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [
        { text: '✅ Confirmar', callback_data: 'confirm:yes' },
        { text: '✕ Cancelar', callback_data: 'confirm:no' },
      ],
    ],
  });
}

async function saveTransaction(userId: string, draft: Record<string, any>) {
  const total = draft.installment_total || 1;
  const today = new Date();

  if (total > 1) {
    const groupId = crypto.randomUUID();
    const rows = Array.from({ length: total }, (_, i) => {
      const d = addMonthsClamped(today, i);
      return {
        user_id: userId,
        category_id: draft.category_id,
        type: draft.type,
        amount: draft.amount,
        description: draft.description ? `${draft.description} (${i + 1}/${total})` : `Parcela ${i + 1}/${total}`,
        date: toISODate(d),
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: total,
      };
    });
    await supabase.from('transactions').insert(rows);
  } else {
    await supabase.from('transactions').insert({
      user_id: userId,
      category_id: draft.category_id,
      type: draft.type,
      amount: draft.amount,
      description: draft.description,
      date: toISODate(today),
    });
  }
}

async function handleCallbackQuery(cb: any) {
  const chatId = cb.message.chat.id;
  const telegramUserId = cb.from.id;
  const data: string = cb.data;

  await answerCallbackQuery(cb.id);

  const userId = await getLinkedUser(telegramUserId);
  if (!userId) {
    await sendMessage(chatId, 'Sua conta não está mais vinculada. Gere um novo código no app.');
    return;
  }

  const conversation = await getConversation(telegramUserId);
  const step = conversation?.step;
  const draft = conversation?.draft || {};

  if (data.startsWith('type:') && step === 'AWAITING_TYPE') {
    draft.type = data.split(':')[1];
    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('type', draft.type)
      .order('name');

    await setConversation(telegramUserId, userId, 'AWAITING_CATEGORY', draft);
    await sendMessage(chatId, 'Qual categoria?', categoryKeyboard(categories || []));
    return;
  }

  if (data === 'cat:new' && step === 'AWAITING_CATEGORY') {
    await setConversation(telegramUserId, userId, 'AWAITING_NEW_CATEGORY_NAME', draft);
    await sendMessage(chatId, 'Qual o nome da nova categoria?');
    return;
  }

  if (data.startsWith('cat:') && step === 'AWAITING_CATEGORY') {
    const categoryId = data.split(':')[1];
    const { data: cat } = await supabase.from('categories').select('*').eq('id', categoryId).maybeSingle();
    draft.category_id = categoryId;
    draft.category_label = cat ? cat.name : 'categoria';
    await setConversation(telegramUserId, userId, 'AWAITING_AMOUNT', draft);
    await sendMessage(chatId, 'Qual o valor? (ex: 85,90)');
    return;
  }

  if (data.startsWith('inst:') && step === 'AWAITING_INSTALLMENT_CHOICE') {
    if (data === 'inst:no') {
      draft.installment_total = 1;
      await setConversation(telegramUserId, userId, 'AWAITING_DESCRIPTION', draft);
      await sendMessage(chatId, 'Quer adicionar uma descrição? Digite ou toque em Pular.', {
        inline_keyboard: [[{ text: 'Pular', callback_data: 'desc:skip' }]],
      });
    } else {
      await setConversation(telegramUserId, userId, 'AWAITING_INSTALLMENT_COUNT', draft);
      await sendMessage(chatId, 'Em quantas parcelas?');
    }
    return;
  }

  if (data === 'desc:skip' && step === 'AWAITING_DESCRIPTION') {
    draft.description = null;
    await setConversation(telegramUserId, userId, 'AWAITING_CONFIRMATION', draft);
    await sendConfirmation(chatId, draft);
    return;
  }

  if (data === 'confirm:yes' && step === 'AWAITING_CONFIRMATION') {
    await saveTransaction(userId, draft);
    await clearConversation(telegramUserId);
    await sendMessage(chatId, '✅ Lançado! Use /novo pra lançar outra.');
    return;
  }

  if (data === 'confirm:no' && step === 'AWAITING_CONFIRMATION') {
    await clearConversation(telegramUserId);
    await sendMessage(chatId, 'Cancelado. Use /novo pra começar de novo.');
    return;
  }
}

async function handleMessage(msg: any) {
  const chatId = msg.chat.id;
  const telegramUserId = msg.from.id;
  const text: string = (msg.text || '').trim();

  if (text === '/start') {
    const userId = await getLinkedUser(telegramUserId);
    await sendMessage(
      chatId,
      userId
        ? 'Você já está vinculado. Use /novo pra lançar uma despesa ou receita.'
        : 'Olá! Pra usar o bot, vincule sua conta primeiro: no app, abra a aba "Telegram" e clique em "Gerar código". Depois me envie esse código aqui.'
    );
    return;
  }

  if (text === '/cancelar') {
    await clearConversation(telegramUserId);
    await sendMessage(chatId, 'Cancelado.');
    return;
  }

  if (text === '/novo') {
    const userId = await getLinkedUser(telegramUserId);
    if (!userId) {
      await sendMessage(chatId, 'Sua conta ainda não está vinculada. Gere um código no app (aba Telegram) e me envie aqui.');
      return;
    }
    await startWizard(telegramUserId, userId, chatId);
    return;
  }

  const conversation = await getConversation(telegramUserId);
  const step = conversation?.step;
  const draft = conversation?.draft || {};
  const userId = conversation?.user_id || (await getLinkedUser(telegramUserId));

  // Código de vínculo de 6 dígitos — só é tratado como tal fora de um fluxo em andamento.
  if (!step && /^\d{6}$/.test(text)) {
    const linked = await tryLinkAccount(telegramUserId, msg.from.username, text);
    await sendMessage(
      chatId,
      linked ? '✅ Conta vinculada! Use /novo pra lançar uma transação.' : 'Código inválido ou expirado. Gere um novo no app.'
    );
    return;
  }

  if (!userId) {
    await sendMessage(chatId, 'Não entendi. Se ainda não vinculou sua conta, gere um código no app (aba Telegram) e me envie aqui.');
    return;
  }

  if (step === 'AWAITING_NEW_CATEGORY_NAME') {
    if (!text) {
      await sendMessage(chatId, 'Digite um nome válido pra categoria.');
      return;
    }
    const { data: newCat, error } = await supabase
      .from('categories')
      .insert({ user_id: userId, name: text, type: draft.type, icon: DEFAULT_ICON[draft.type as string], color: DEFAULT_COLOR })
      .select()
      .single();

    if (error || !newCat) {
      await sendMessage(chatId, 'Não consegui criar a categoria. Tenta de novo.');
      return;
    }

    draft.category_id = newCat.id;
    draft.category_label = newCat.name;
    await setConversation(telegramUserId, userId, 'AWAITING_AMOUNT', draft);
    await sendMessage(chatId, `Categoria "${newCat.name}" criada! Qual o valor? (ex: 85,90)`);
    return;
  }

  if (step === 'AWAITING_AMOUNT') {
    const amount = parseFloat(text.replace(/[^\d,.-]/g, '').replace(',', '.'));
    if (!amount || amount <= 0) {
      await sendMessage(chatId, 'Não entendi o valor. Manda só o número, tipo 85,90.');
      return;
    }
    draft.amount = amount;
    await setConversation(telegramUserId, userId, 'AWAITING_INSTALLMENT_CHOICE', draft);
    await sendMessage(chatId, 'É parcelado?', {
      inline_keyboard: [
        [
          { text: 'Sim', callback_data: 'inst:yes' },
          { text: 'Não', callback_data: 'inst:no' },
        ],
      ],
    });
    return;
  }

  if (step === 'AWAITING_INSTALLMENT_COUNT') {
    const count = parseInt(text, 10);
    if (!count || count < 2 || count > 60) {
      await sendMessage(chatId, 'Manda um número de parcelas entre 2 e 60.');
      return;
    }
    draft.installment_total = count;
    await setConversation(telegramUserId, userId, 'AWAITING_DESCRIPTION', draft);
    await sendMessage(chatId, 'Quer adicionar uma descrição? Digite ou toque em Pular.', {
      inline_keyboard: [[{ text: 'Pular', callback_data: 'desc:skip' }]],
    });
    return;
  }

  if (step === 'AWAITING_DESCRIPTION') {
    draft.description = text || null;
    await setConversation(telegramUserId, userId, 'AWAITING_CONFIRMATION', draft);
    await sendConfirmation(chatId, draft);
    return;
  }

  if (step === 'AWAITING_TYPE' || step === 'AWAITING_CATEGORY' || step === 'AWAITING_INSTALLMENT_CHOICE' || step === 'AWAITING_CONFIRMATION') {
    await sendMessage(chatId, 'Usa os botões ali em cima pra responder 🙂');
    return;
  }

  await sendMessage(chatId, 'Não entendi. Use /novo pra lançar uma despesa ou receita.');
}

Deno.serve(async (req) => {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  try {
    const update = await req.json();
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }
  } catch (err) {
    console.error('Erro processando update do Telegram:', err);
  }

  return new Response('ok', { status: 200 });
});
