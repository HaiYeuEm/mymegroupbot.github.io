const API_BASE = String(window.MYME_API_BASE || '').trim().replace(/\/$/, '');
const API_CONFIGURED = Boolean(API_BASE && /^https?:\/\//i.test(API_BASE) && !/YOUR[-_ ]?BOT|example\.com|localhost/i.test(API_BASE));
const state = { guilds: [], guildId: '', tickets: [], filter: 'all', search: '', config: null };
const $ = selector => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function api(url, options = {}) {
  const response = await fetch(API_BASE + url, {
    credentials: 'include',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Yêu cầu thất bại (HTTP ${response.status})`);
  return data;
}

function configureLoginLinks() {
  document.querySelectorAll('a[href="/auth/login"]').forEach(link => {
    if (API_CONFIGURED) { link.href = API_BASE + '/auth/login'; link.removeAttribute('aria-disabled'); }
    else { link.href = '#'; link.setAttribute('aria-disabled', 'true'); link.title = 'Cần cấu hình URL backend trong config.js'; }
    link.addEventListener('click', event => {
      if (!API_CONFIGURED) { event.preventDefault(); showError('Website chưa kết nối backend. Mở config.js và điền URL HTTPS của MyMe Ticket Bot đang chạy.'); }
    });
  });
}

function showError(message) {
  const el = $('#globalError');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => { el.hidden = true; }, 7000);
}

function setBotStatus(ready, name) {
  const el = $('#botStatus');
  el.classList.toggle('ready', Boolean(ready));
  el.classList.toggle('offline', !ready);
  el.innerHTML = `<i></i>${ready ? `Bot trực tuyến${name ? ` · ${escapeHtml(name)}` : ''}` : 'Bot chưa sẵn sàng'}`;
  const title = $('#sidebarHealthTitle');
  const text = $('#sidebarHealthText');
  if (title) title.textContent = ready ? 'Bot đang hoạt động' : (API_CONFIGURED ? 'Chưa kết nối bot' : 'Chưa cấu hình backend');
  if (text) text.textContent = ready ? (name || 'Kết nối ổn định') : (API_CONFIGURED ? 'Kiểm tra máy chủ bot' : 'Cần URL backend HTTPS');
}

function showLoggedOut(oauthConfigured) {
  document.body.classList.add('logged-out');
  $('#loginView').hidden = false;
  $('#dashboardView').hidden = true;
  $('#accountArea').hidden = true;
  $('#loginBtn').hidden = false;
  $('#oauthWarning').hidden = Boolean(oauthConfigured) && API_CONFIGURED;
  const hint = $('#connectionHint');
  if (hint && !API_CONFIGURED) {
    hint.hidden = false;
    hint.textContent = 'Giao diện đã sẵn sàng, nhưng chưa thể đăng nhập hoặc điều khiển bot vì config.js vẫn chưa có URL backend công khai.';
  } else if (hint) { hint.hidden = true; }
}

function showLoggedIn(user) {
  document.body.classList.remove('logged-out');
  $('#loginView').hidden = true;
  $('#dashboardView').hidden = false;
  $('#accountArea').hidden = false;
  $('#loginBtn').hidden = true;
  $('#userName').textContent = user.global_name || user.username;
  const avatar = user.avatar
    ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(user.id.slice(-1)) % 6}.png`;
  $('#userAvatar').src = avatar;
}

async function initialize() {
  configureLoginLinks();
  if (!API_CONFIGURED) {
    setBotStatus(false, null);
    showLoggedOut(false);
    return;
  }
  let status = { oauthConfigured: false, botReady: false, botName: null };
  try { status = await api('/api/status'); } catch { /* shown in the bot status pill */ }
  setBotStatus(status.botReady, status.botName);

  let me;
  try {
    me = await api('/api/me');
  } catch (error) {
    showLoggedOut(status.oauthConfigured);
    if (error.message !== 'Chưa đăng nhập') showError(error.message);
    return;
  }
  showLoggedIn(me.user);
  await loadGuilds();
}

async function loadGuilds() {
  try {
    const response = await api('/api/guilds');
    state.guilds = response.guilds || [];
    const select = $('#serverSelect');
    select.innerHTML = '';
    if (state.guilds.length === 0) {
      select.innerHTML = '<option value="">Không tìm thấy server có quyền quản trị</option>';
      select.disabled = true;
      $('#serverNotice').textContent = 'Tài khoản này chưa có quyền Quản lý Server/Administrator trong server nào, hoặc cần đăng nhập lại để cập nhật quyền Discord.';
      $('#serverNotice').hidden = false;
      renderTickets();
      return;
    }
    for (const guild of state.guilds) {
      const option = document.createElement('option');
      option.value = guild.id;
      option.textContent = `${guild.botPresent ? '' : '⚠ '}${guild.name}${guild.botPresent ? '' : ' (bot chưa tham gia)'}`;
      option.disabled = !guild.botPresent;
      select.append(option);
    }
    select.disabled = false;
    const selected = state.guilds.find(guild => guild.botPresent);
    if (!selected) {
      $('#serverNotice').textContent = 'Bot chưa được thêm vào bất kỳ server quản trị nào trong danh sách. Hãy mời bot vào server và tải lại trang.';
      $('#serverNotice').hidden = false;
      select.value = state.guilds[0].id;
      state.guildId = '';
      renderTickets();
      return;
    }
    $('#serverNotice').hidden = true;
    select.value = selected.id;
    state.guildId = selected.id;
    await loadServer();
  } catch (error) {
    showError(error.message);
  }
}

async function loadServer() {
  if (!state.guildId) return;
  try {
    const [summary, config, tickets] = await Promise.all([
      api(`/api/guild/${encodeURIComponent(state.guildId)}/summary`),
      api(`/api/guild/${encodeURIComponent(state.guildId)}/config`),
      api(`/api/guild/${encodeURIComponent(state.guildId)}/tickets`),
    ]);
    $('#statTotal').textContent = summary.stats.total;
    $('#statOpen').textContent = summary.stats.open;
    $('#statClosed').textContent = summary.stats.closed;
    $('#statRated').textContent = summary.stats.rated;
    state.config = config.config;
    state.tickets = tickets.tickets || [];
    renderConfig(state.config);
    renderTickets();
    $('#serverNotice').hidden = true;
  } catch (error) {
    showError(error.message);
    if (error.message.includes('Bot chưa được thêm')) $('#serverNotice').textContent = error.message;
    $('#serverNotice').hidden = !error.message.includes('Bot chưa được thêm');
  }
}

function renderConfig(config) {
  $('#staffRoleId').value = config.staffRoleId || '';
  $('#logsChannelId').value = config.logsChannelId || '';
  $('#categoryId').value = config.categoryId || '';
  $('#panelTitle').value = config.panelTitle || 'MyMe Support Center';
  $('#panelDescription').value = config.panelDescription || '';
  $('#panelImageUrl').value = config.panelImageUrl || '';
  $('#configMessage').textContent = '';
  $('#configMessage').classList.remove('error');
}

function categoryName(value) {
  return ({ support: 'Hỗ trợ', purchase: 'Mua hàng', report: 'Báo cáo', other: 'Khác' })[value] || value || 'Khác';
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function ticketRow(ticket) {
  const open = ticket.status === 'open';
  const rate = Number.isInteger(ticket.rating) ? `<span class="rating">${'★'.repeat(ticket.rating)}${'☆'.repeat(5 - ticket.rating)}</span>` : '<span class="muted-text">Chưa có</span>';
  const claimButton = open ? `<button class="table-action" type="button" data-ticket-action="claim" data-ticket-id="${escapeHtml(ticket.id)}">${ticket.claimedBy ? 'Đã nhận' : 'Nhận xử lý'}</button>` : '';
  const closeButton = open ? `<button class="table-action danger" type="button" data-ticket-action="close" data-ticket-id="${escapeHtml(ticket.id)}">Đóng</button>` : '';
  const ticketLink = open && ticket.channelUrl
    ? `<a class="ticket-id" href="${escapeHtml(ticket.channelUrl)}" target="_blank" rel="noopener noreferrer">#${escapeHtml(String(ticket.channelId).slice(-6))} ↗</a>`
    : `<span class="ticket-id">#${escapeHtml(String(ticket.channelId).slice(-6))} · đã xóa</span>`;
  const openButton = open && ticket.channelUrl
    ? `<a class="table-action" href="${escapeHtml(ticket.channelUrl)}" target="_blank" rel="noopener noreferrer">Mở ↗</a>`
    : '';
  return `<tr>
    <td>${ticketLink}<span class="ticket-sub">${escapeHtml(ticket.id.slice(0, 8))}</span></td>
    <td class="user-cell" title="${escapeHtml(ticket.username)}">${escapeHtml(ticket.username)}<span class="ticket-sub">ID ${escapeHtml(ticket.userId)}</span></td>
    <td><span class="category-chip">${escapeHtml(categoryName(ticket.category))}</span></td>
    <td><span class="status-chip ${open ? 'open' : 'closed'}"><i></i>${open ? 'Đang mở' : 'Đã đóng'}</span>${ticket.claimedBy ? `<span class="ticket-sub">Đã nhận bởi ${escapeHtml(ticket.claimedBy.slice(-6))}</span>` : ''}</td>
    <td>${rate}</td>
    <td>${escapeHtml(dateLabel(ticket.createdAt))}</td>
    <td><div class="action-group">${openButton}${claimButton}${closeButton}</div></td>
  </tr>`;
}

function renderTickets() {
  const query = state.search.trim().toLowerCase();
  const filtered = state.tickets.filter(ticket => {
    const statusMatches = state.filter === 'all' || ticket.status === state.filter;
    const queryMatches = !query || [ticket.id, ticket.channelId, ticket.username, ticket.userId, categoryName(ticket.category)].some(value => String(value || '').toLowerCase().includes(query));
    return statusMatches && queryMatches;
  });
  $('#ticketCount').textContent = `${state.tickets.length} ticket`;
  const navCount = $('#navTicketCount');
  if (navCount) navCount.textContent = String(state.tickets.filter(ticket => ticket.status === 'open').length);
  $('#tableSummary').textContent = `Hiển thị ${filtered.length} / ${state.tickets.length} ticket`;
  $('#ticketsBody').innerHTML = filtered.length
    ? filtered.map(ticketRow).join('')
    : '<tr><td colspan="7" class="empty-cell">Không có ticket phù hợp với bộ lọc.</td></tr>';
}

async function handleTicketAction(button) {
  const action = button.dataset.ticketAction;
  const ticketId = button.dataset.ticketId;
  if (!state.guildId || !ticketId) return;
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = 'Đang xử lý...';
  try {
    const response = await api(`/api/guild/${encodeURIComponent(state.guildId)}/tickets/${encodeURIComponent(ticketId)}/action`, {
      method: 'POST', body: JSON.stringify({ action }),
    });
    await loadServer();
    showToast(response.message || 'Đã cập nhật ticket.');
  } catch (error) {
    showError(error.message);
    button.disabled = false;
    button.textContent = oldText;
  }
}

function showToast(message) {
  $('#configMessage').textContent = message;
  $('#configMessage').classList.remove('error');
  setTimeout(() => { if ($('#configMessage').textContent === message) $('#configMessage').textContent = ''; }, 4500);
}

$('#serverSelect').addEventListener('change', async event => {
  state.guildId = event.target.value;
  await loadServer();
});

$('#refreshBtn').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const status = await api('/api/status');
    setBotStatus(status.botReady, status.botName);
    await loadGuilds();
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; }
});

for (const tab of document.querySelectorAll('.filter-tab')) {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(item => item.classList.toggle('active', item === tab));
    state.filter = tab.dataset.filter;
    renderTickets();
  });
}

$('#ticketSearch').addEventListener('input', event => {
  state.search = event.target.value;
  renderTickets();
});

$('#ticketsBody').addEventListener('click', event => {
  const button = event.target.closest('[data-ticket-action]');
  if (button) handleTicketAction(button);
});

$('#configForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.guildId) return showError('Hãy chọn server có bot trước.');
  const button = $('#saveConfigBtn');
  const message = $('#configMessage');
  button.disabled = true;
  message.textContent = 'Đang lưu...';
  message.classList.remove('error');
  const body = {
    staffRoleId: $('#staffRoleId').value.trim(),
    logsChannelId: $('#logsChannelId').value.trim(),
    categoryId: $('#categoryId').value.trim(),
    panelTitle: $('#panelTitle').value.trim(),
    panelDescription: $('#panelDescription').value.trim(),
    panelImageUrl: $('#panelImageUrl').value.trim(),
  };
  try {
    const response = await api(`/api/guild/${encodeURIComponent(state.guildId)}/config`, { method: 'POST', body: JSON.stringify(body) });
    state.config = response.config;
    renderConfig(response.config);
    showToast('Đã lưu cấu hình. Dùng /ticket-panel để gửi bảng ticket mới.');
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  } finally {
    button.disabled = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST', body: '{}' }); }
  catch (error) { showError(error.message); }
  state.guilds = [];
  state.tickets = [];
  showLoggedOut(true);
});

for (const link of document.querySelectorAll('.nav-link')) {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach(item => item.classList.toggle('active', item === link));
    const labels = { '#overview': 'Tổng quan', '#tickets': 'Quản lý ticket', '#settings': 'Cấu hình bot' };
    const title = $('#breadcrumbTitle');
    if (title) title.textContent = labels[link.getAttribute('href')] || 'Tổng quan';
  });
}

initialize();
