const el = id => document.getElementById(id);
let history = [];
let busy = false;
function preference(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* The workspace also works when storage is unavailable. */ }
}
const theme = preference('luna-desktop-theme') === 'dark' ? 'dark' : 'luna';
document.documentElement.dataset.theme = theme;
el('theme').value = theme;
el('theme').onchange = () => {
  document.documentElement.dataset.theme = el('theme').value;
  preference('luna-desktop-theme', el('theme').value);
};
function clearChat() {
  history = [];
  el('messages').replaceChildren();
  el('intro').hidden = false;
}
function controls() {
  el('send').disabled = busy || !el('model').value;
  el('clear').disabled = el('model').disabled = el('refresh').disabled = busy;
}
async function refresh() {
  el('refresh').disabled = true;
  el('status').textContent = 'Connecting to Ollama…';
  try {
    const models = await window.lunaDesktop.models();
    const previous = el('model').value || preference('luna-desktop-model');
    el('model').replaceChildren(...models.map(name => new Option(name, name)));
    if (models.includes(previous)) el('model').value = previous;
    el('model-count').textContent = models.length + ' INSTALLED';
    el('status').textContent = models.length ? 'Ollama connected. Ready to chat locally.' : 'No models installed. Follow the setup below, then refresh.';
  } catch (e) {
    el('model').replaceChildren(new Option('Ollama not connected', ''));
    el('model-count').textContent = 'NOT CONNECTED';
    el('status').textContent = e.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  } finally { controls(); }
}
function line(role, content) {
  el('intro').hidden = true;
  const message = document.createElement('div');
  message.className = 'message ' + (role === 'You' ? 'user' : 'assistant');
  const label = document.createElement('strong');
  label.textContent = role;
  message.append(label, document.createTextNode(content));
  el('messages').append(message);
  message.scrollIntoView({ block: 'nearest' });
}
el('refresh').onclick = refresh;
el('clear').onclick = clearChat;
el('model').onchange = () => {
  preference('luna-desktop-model', el('model').value);
  clearChat();
  controls();
};
function focusChat() { el('prompt').focus(); }
el('home').onclick = () => window.scrollTo({top:0,behavior:'smooth'});
el('focus-chat').onclick = el('chat-launcher').onclick = focusChat;
el('setup-link').onclick = () => el('setup').scrollIntoView({behavior:'smooth',block:'center'});
document.querySelectorAll('[data-page]').forEach(button => {
  button.onclick = async () => {
    if (busy) { el('status').textContent = 'Wait for the local answer before leaving this workspace.'; return; }
    try { await window.lunaDesktop.navigate(button.dataset.page); }
    catch (e) { el('status').textContent = e.message; }
  };
});
document.querySelectorAll('[data-prompt]').forEach(button => {
  button.onclick = () => { el('prompt').value = button.dataset.prompt; focusChat(); };
});
el('prompt').onkeydown = event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    el('chat').requestSubmit();
  }
};
el('chat').onsubmit = async event => {
  event.preventDefault();
  if (busy || !el('model').value || !el('prompt').value.trim()) return;
  busy = true;
  controls();
  const text = el('prompt').value.trim();
  const next = [...history, { role: 'user', content: text }].slice(-39);
  line('You', text);
  el('prompt').value = '';
  el('status').textContent = 'Generating locally…';
  try {
    const answer = await window.lunaDesktop.chat({ model: el('model').value, messages: next });
    history = [...next, { role: 'assistant', content: answer }];
    line('Lilo', answer);
    el('status').textContent = 'Answered locally with ' + el('model').value;
  } catch (e) { el('status').textContent = e.message.replace(/^Error invoking remote method '[^']+': Error: /, ''); }
  finally { busy = false; controls(); }
};
controls();
refresh();
