/**
 * NEXA AI — script.js
 * Pure Vanilla JavaScript — no frameworks
 * Supports: OpenAI (ChatGPT), Google Gemini, Anthropic Claude
 */

"use strict";

// =====================================================================
// STATE
// =====================================================================

const state = {
  mode: "single",          // "single" | "multi"
  selectedAI: "openai",    // "openai" | "gemini" | "claude"
  keys: { openai: "", gemini: "", claude: "" },
  messages: [],            // [{role, content}] — conversation history
  isLoading: false,
  ttsEnabled: false,
  chatHistory: [],         // [{id, title, messages}]
  currentHistoryId: null,
  recognition: null,
  isRecording: false,
};

// =====================================================================
// DOM HELPERS
// =====================================================================

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// =====================================================================
// LOCAL STORAGE
// =====================================================================

function loadState() {
  try {
    const keys = localStorage.getItem("nexa_keys");
    if (keys) state.keys = { ...state.keys, ...JSON.parse(keys) };

    const hist = localStorage.getItem("nexa_history");
    if (hist) state.chatHistory = JSON.parse(hist);

    const mode = localStorage.getItem("nexa_mode");
    if (mode) state.mode = mode;

    const ai = localStorage.getItem("nexa_selected_ai");
    if (ai) state.selectedAI = ai;
  } catch (e) {
    console.warn("Failed to load saved state:", e);
  }
}

function saveState() {
  localStorage.setItem("nexa_keys", JSON.stringify(state.keys));
  localStorage.setItem("nexa_history", JSON.stringify(state.chatHistory));
  localStorage.setItem("nexa_mode", state.mode);
  localStorage.setItem("nexa_selected_ai", state.selectedAI);
}

// =====================================================================
// WELCOME SCREEN & PARTICLES
// =====================================================================

function createParticles() {
  const container = $("particles");
  for (let i = 0; i < 42; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const size = 1 + Math.random() * 3;
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${size}px;
      height: ${size}px;
      opacity: ${0.25 + Math.random() * 0.75};
      animation-duration: ${5 + Math.random() * 10}s;
      animation-delay: ${Math.random() * 6}s;
      --dx: ${(Math.random() - 0.5) * 120}px;
    `;
    container.appendChild(p);
  }
}

function launchApp() {
  const ws = $("welcome-screen");
  ws.classList.add("fade-out");
  setTimeout(() => {
    ws.classList.add("hidden");
    $("main-app").classList.remove("hidden");
    applyUIState();
  }, 600);
}

// =====================================================================
// UI STATE APPLICATION
// =====================================================================

function applyUIState() {
  const isSingle = state.mode === "single";

  // Mode toggle
  $("mode-single").classList.toggle("active", isSingle);
  $("mode-multi").classList.toggle("active", !isSingle);
  $("mode-slider").classList.toggle("is-multi", !isSingle);

  // Single AI selector visibility
  $("single-ai-selector").classList.toggle("hidden", !isSingle);

  // AI item active state
  $$(".ai-item").forEach(el => {
    el.classList.toggle("active", el.dataset.ai === state.selectedAI);
  });

  // Mode badge
  const badgeDot = document.querySelector(".badge-dot");
  badgeDot.className = "badge-dot " + (isSingle ? "single" : "multi");

  const names = { openai: "ChatGPT", gemini: "Gemini", claude: "Claude" };
  $("mode-badge-text").textContent = isSingle
    ? `Single AI — ${names[state.selectedAI]}`
    : "Multi-AI — Comparing all models";

  // Key inputs
  $("key-openai").value = state.keys.openai;
  $("key-gemini").value = state.keys.gemini;
  $("key-claude").value = state.keys.claude;

  updateKeyStatuses();
  renderHistory();
}

function updateKeyStatuses() {
  ["openai", "gemini", "claude"].forEach(ai => {
    const el = $(`status-${ai}`);
    if (state.keys[ai]) {
      el.textContent = "✓ Key saved";
      el.className = "key-status";
    } else {
      el.textContent = "";
    }
  });
}

// =====================================================================
// CHAT HISTORY
// =====================================================================

function renderHistory() {
  const list = $("history-list");
  if (state.chatHistory.length === 0) {
    list.innerHTML = '<div class="history-empty">No chat history yet</div>';
    return;
  }
  list.innerHTML = state.chatHistory
    .slice()
    .reverse()
    .map(h => `<div class="history-item" data-id="${h.id}">${escHtml(h.title)}</div>`)
    .join("");

  $$(".history-item").forEach(item => {
    item.addEventListener("click", () => loadHistory(item.dataset.id));
  });
}

function saveCurrentChat(firstMessage) {
  if (!state.currentHistoryId) {
    state.currentHistoryId = Date.now().toString();
  }
  const title = firstMessage.slice(0, 52) + (firstMessage.length > 52 ? "…" : "");
  const existing = state.chatHistory.find(h => h.id === state.currentHistoryId);
  if (existing) {
    existing.messages = [...state.messages];
    existing.title = title;
  } else {
    state.chatHistory.push({
      id: state.currentHistoryId,
      title,
      messages: [...state.messages],
    });
  }
  if (state.chatHistory.length > 30) state.chatHistory.shift();
  saveState();
  renderHistory();
}

function loadHistory(id) {
  const hist = state.chatHistory.find(h => h.id === id);
  if (!hist) return;
  state.messages = [...hist.messages];
  state.currentHistoryId = id;
  rebuildFromHistory();
}

function rebuildFromHistory() {
  const container = $("messages");
  container.innerHTML = "";
  if (state.messages.length === 0) {
    container.appendChild(emptyStateEl());
    return;
  }
  // Simplified rebuild — show user messages only
  for (let i = 0; i < state.messages.length; i++) {
    const m = state.messages[i];
    if (m.role === "user") {
      const row = document.createElement("div");
      row.className = "msg-row";
      row.innerHTML = `<div class="user-wrap"><div class="user-bubble">${escHtml(m.content)}</div></div>`;
      container.appendChild(row);
    } else {
      const row = document.createElement("div");
      row.className = "msg-row";
      const ai = m.ai || state.selectedAI;
      row.innerHTML = `
        <div class="ai-responses">
          ${buildCardHTML(ai, m.content, false)}
        </div>`;
      container.appendChild(row);
      wireCardButtons(row);
    }
  }
  scrollBottom();
}

function emptyStateEl() {
  const div = document.createElement("div");
  div.id = "empty-state";
  div.innerHTML = `
    <div class="mini-hex sz-60">N</div>
    <h2 class="empty-title">How can I help you?</h2>
    <p class="empty-sub">Ask me anything. Powered by the world's best AI models.</p>
    <div class="suggestions">
      <button class="suggestion" data-text="Explain quantum computing in simple terms">Explain quantum computing</button>
      <button class="suggestion" data-text="Write a Python function to reverse a string">Write Python code</button>
      <button class="suggestion" data-text="What are the latest trends in AI for 2025?">AI trends 2025</button>
      <button class="suggestion" data-text="Help me brainstorm creative ideas for a mobile app">Brainstorm app ideas</button>
    </div>`;
  div.querySelectorAll(".suggestion").forEach(btn => {
    btn.addEventListener("click", () => handleSend(btn.dataset.text));
  });
  return div;
}

// =====================================================================
// MESSAGE RENDERING
// =====================================================================

function formatResponse(text) {
  // Code blocks
  text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const l = lang || "code";
    const escaped = escHtml(code.trim());
    return `<div class="code-block">
      <div class="code-top">
        <span class="code-lang">${l}</span>
        <button class="code-copy" onclick="copyCode(this)">Copy</button>
      </div>
      <pre>${escaped}</pre>
    </div>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g,
    '<span class="inline-code">$1</span>');

  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Headings
  text = text.replace(/^### (.*?)$/gm,
    '<div style="font-size:.92em;font-weight:700;color:#e2e8f0;margin:.45em 0 .18em">$1</div>');
  text = text.replace(/^## (.*?)$/gm,
    '<div style="font-size:.98em;font-weight:700;color:#e2e8f0;margin:.55em 0 .22em">$1</div>');
  text = text.replace(/^# (.*?)$/gm,
    '<div style="font-size:1.05em;font-weight:800;color:#e2e8f0;margin:.65em 0 .28em">$1</div>');

  // Bullet list
  text = text.replace(/^[-*] (.*?)$/gm,
    '<div style="display:flex;gap:.45em;margin:.12em 0"><span style="color:#4b5563;flex-shrink:0">•</span><span>$1</span></div>');

  // Numbered list
  text = text.replace(/^\d+\. (.*?)$/gm,
    '<div style="display:flex;gap:.45em;margin:.12em 0"><span style="color:#4b5563;flex-shrink:0;min-width:1.1em">·</span><span>$1</span></div>');

  // Paragraphs
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  return `<p>${text}</p>`;
}

// AI metadata
const AI_META = {
  openai: { name: "ChatGPT",  icon: "⚡", cls: "openai" },
  gemini: { name: "Gemini",   icon: "✦", cls: "gemini" },
  claude: { name: "Claude",   icon: "◈", cls: "claude" },
};

function buildCardHTML(ai, content, isError) {
  const m = AI_META[ai] || AI_META.openai;
  const bodyContent = isError
    ? `<span style="color:#ef4444;margin-right:.35em">⚠</span>${escHtml(content)}`
    : formatResponse(content);
  return `
    <div class="ai-card${isError ? " is-error" : ""}">
      <div class="card-hdr">
        <div class="card-ai-info">
          <div class="card-avi ${m.cls}">${m.icon}</div>
          <span class="card-ai-name">${m.name}</span>
        </div>
        <div class="card-actions">
          <button class="card-btn copy-btn" title="Copy response">📋</button>
          <button class="card-btn speak-btn" title="Read aloud">🔊</button>
          <button class="card-btn regen-btn" title="Regenerate" data-ai="${ai}">↺</button>
        </div>
      </div>
      <div class="card-body${isError ? " is-error" : ""}">${bodyContent}</div>
    </div>`;
}

function buildTypingCardHTML(ai) {
  const m = AI_META[ai] || AI_META.openai;
  return `
    <div class="ai-card" id="typing-${ai}">
      <div class="card-hdr">
        <div class="card-ai-info">
          <div class="card-avi ${m.cls}">${m.icon}</div>
          <span class="card-ai-name">${m.name}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="typing">
          <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        </div>
      </div>
    </div>`;
}

function wireCardButtons(row) {
  row.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const text = btn.closest(".ai-card").querySelector(".card-body").innerText;
      navigator.clipboard.writeText(text).then(() => showToast("Copied!", "ok"));
    });
  });

  row.querySelectorAll(".speak-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const text = btn.closest(".ai-card").querySelector(".card-body").innerText;
      speak(text);
    });
  });

  row.querySelectorAll(".regen-btn").forEach(btn => {
    btn.addEventListener("click", () => regenCard(btn));
  });
}

function scrollBottom() {
  const c = $("messages");
  setTimeout(() => { c.scrollTop = c.scrollHeight; }, 60);
}

// =====================================================================
// SEND MESSAGE
// =====================================================================

async function handleSend(textOverride) {
  const inputEl = $("msg-input");
  const text = textOverride || inputEl.textContent.trim();
  if (!text || state.isLoading) return;

  // Hide empty state
  const es = $("empty-state");
  if (es) es.remove();

  state.isLoading = true;
  $("send-btn").disabled = true;
  inputEl.textContent = "";

  // User message
  const msgContainer = $("messages");
  const userRow = document.createElement("div");
  userRow.className = "msg-row";
  userRow.innerHTML = `<div class="user-wrap"><div class="user-bubble">${escHtml(text)}</div></div>`;
  msgContainer.appendChild(userRow);
  scrollBottom();

  // Which AIs to query
  const aisToQuery = state.mode === "multi"
    ? ["openai", "gemini", "claude"]
    : [state.selectedAI];

  // AI response row
  const aiRow = document.createElement("div");
  aiRow.className = "msg-row";
  const responsesDiv = document.createElement("div");
  responsesDiv.className = "ai-responses" + (aisToQuery.length > 1 ? " multi" : "");
  aisToQuery.forEach(ai => { responsesDiv.innerHTML += buildTypingCardHTML(ai); });
  aiRow.appendChild(responsesDiv);
  msgContainer.appendChild(aiRow);
  scrollBottom();

  // Capture history before adding new user message
  const prevHistory = [...state.messages];
  state.messages.push({ role: "user", content: text });

  // Fire all API calls in parallel
  const results = await Promise.all(aisToQuery.map(async ai => {
    const card = $(`typing-${ai}`);
    try {
      const reply = await callAPI(ai, text, prevHistory);
      // Replace card
      card.outerHTML = buildCardHTML(ai, reply, false);
      // Re-wire (after DOM update)
      const newCard = responsesDiv.querySelector(`.ai-card:last-child`);
      wireCardButtons(aiRow);
      // TTS for primary AI
      if (state.ttsEnabled && ai === aisToQuery[0]) speak(reply);
      return { ai, reply };
    } catch (err) {
      card.outerHTML = buildCardHTML(ai, err.message || "An error occurred.", true);
      wireCardButtons(aiRow);
      return { ai, reply: null };
    }
  }));

  // Re-wire all after all DOM updates
  wireCardButtons(aiRow);

  // Save primary response to history
  const primary = results.find(r => r.ai === aisToQuery[0]);
  if (primary?.reply) {
    state.messages.push({ role: "assistant", content: primary.reply, ai: aisToQuery[0] });
  }
  saveCurrentChat(text);

  state.isLoading = false;
  $("send-btn").disabled = false;
  scrollBottom();
}

// =====================================================================
// REGENERATE
// =====================================================================

async function regenCard(btn) {
  if (state.isLoading) return;
  const ai = btn.dataset.ai;
  const card = btn.closest(".ai-card");
  const lastUser = [...state.messages].reverse().find(m => m.role === "user");
  if (!lastUser) return;

  card.querySelector(".card-body").innerHTML = `
    <div class="typing">
      <div class="dot"></div><div class="dot"></div><div class="dot"></div>
    </div>`;
  card.classList.remove("is-error");

  try {
    const reply = await callAPI(ai, lastUser.content, state.messages.slice(0, -2));
    card.querySelector(".card-body").innerHTML = formatResponse(reply);
    card.querySelector(".card-body").className = "card-body";
  } catch (err) {
    card.querySelector(".card-body").innerHTML =
      `<span style="color:#ef4444;margin-right:.35em">⚠</span>${escHtml(err.message)}`;
    card.querySelector(".card-body").className = "card-body is-error";
    card.classList.add("is-error");
  }
  scrollBottom();
}

// =====================================================================
// API CALLERS
// =====================================================================

async function callAPI(ai, prompt, history) {
  switch (ai) {
    case "openai": return callOpenAI(prompt, history);
    case "gemini": return callGemini(prompt, history);
    case "claude": return callClaude(prompt, history);
    default: throw new Error("Unknown AI: " + ai);
  }
}

async function callOpenAI(prompt, history) {
  if (!state.keys.openai)
    throw new Error("OpenAI API key not set — add it in the sidebar.");

  const messages = [
    { role: "system", content: "You are NEXA AI, a helpful and knowledgeable assistant. Be concise and clear." },
    ...history.slice(-12),
    { role: "user", content: prompt },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${state.keys.openai}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(prompt, history) {
  if (!state.keys.gemini)
    throw new Error("Gemini API key not set — add it in the sidebar.");

  const contents = [
    ...history.slice(-12).map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: prompt }] },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${state.keys.gemini}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: "You are NEXA AI, a helpful and knowledgeable assistant. Be concise and clear." }],
      },
      generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callClaude(prompt, history) {
  if (!state.keys.claude)
    throw new Error("Claude API key not set — add it in the sidebar.");

  const messages = [
    ...history.slice(-12),
    { role: "user", content: prompt },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": state.keys.claude,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1500,
      system: "You are NEXA AI, a helpful and knowledgeable assistant. Be concise and clear.",
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Claude error ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// =====================================================================
// COPY CODE (global for onclick)
// =====================================================================

window.copyCode = function (btn) {
  const pre = btn.closest(".code-block").querySelector("pre");
  navigator.clipboard.writeText(pre.textContent)
    .then(() => showToast("Code copied!", "ok"));
};

// =====================================================================
// TEXT-TO-SPEECH
// =====================================================================

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const plain = text.replace(/<[^>]*>/g, "").slice(0, 600);
  const utt = new SpeechSynthesisUtterance(plain);
  utt.rate = 0.95;
  utt.pitch = 1;
  window.speechSynthesis.speak(utt);
}

// =====================================================================
// VOICE INPUT
// =====================================================================

function setupVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  const recog = new SR();
  recog.continuous = false;
  recog.interimResults = false;
  recog.lang = "en-US";
  state.recognition = recog;

  recog.onresult = e => {
    const transcript = e.results[0][0].transcript;
    $("msg-input").textContent = transcript;
    stopRecording();
  };
  recog.onerror = () => { stopRecording(); showToast("Voice input failed", "err"); };
  recog.onend = () => { stopRecording(); };
}

function startRecording() {
  if (!state.recognition) { showToast("Voice not supported in this browser", "err"); return; }
  state.isRecording = true;
  $("voice-btn").classList.add("is-recording");
  $("voice-indicator").classList.remove("hidden");
  try { state.recognition.start(); } catch (e) { stopRecording(); }
}

function stopRecording() {
  state.isRecording = false;
  $("voice-btn").classList.remove("is-recording");
  $("voice-indicator").classList.add("hidden");
  try { state.recognition?.stop(); } catch {}
}

// =====================================================================
// TOAST
// =====================================================================

function showToast(msg, type = "") {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = `toast${type ? " " + type : ""}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// =====================================================================
// CLEAR CHAT
// =====================================================================

function clearChat() {
  state.messages = [];
  state.currentHistoryId = null;
  const c = $("messages");
  c.innerHTML = "";
  c.appendChild(emptyStateEl());
}

// =====================================================================
// EVENT LISTENERS
// =====================================================================

function attachEvents() {
  // Welcome
  $("launch-btn").addEventListener("click", launchApp);

  // Sidebar toggle
  $("sidebar-toggle").addEventListener("click", () => {
    $("sidebar").classList.toggle("closed");
  });
  $("sidebar-close").addEventListener("click", () => {
    $("sidebar").classList.add("closed");
  });

  // Mode switch
  $("mode-single").addEventListener("click", () => {
    state.mode = "single";
    saveState();
    applyUIState();
  });
  $("mode-multi").addEventListener("click", () => {
    state.mode = "multi";
    saveState();
    applyUIState();
  });

  // AI selection
  $$(".ai-item").forEach(item => {
    item.addEventListener("click", () => {
      state.selectedAI = item.dataset.ai;
      saveState();
      applyUIState();
    });
  });

  // Key eye toggles
  $$(".key-eye").forEach(btn => {
    btn.addEventListener("click", () => {
      const inp = document.getElementById(btn.dataset.target);
      inp.type = inp.type === "password" ? "text" : "password";
    });
  });

  // Save keys
  $("save-keys-btn").addEventListener("click", () => {
    state.keys.openai = $("key-openai").value.trim();
    state.keys.gemini = $("key-gemini").value.trim();
    state.keys.claude = $("key-claude").value.trim();
    saveState();
    updateKeyStatuses();
    showToast("API keys saved!", "ok");
  });

  // Clear chat
  $("clear-btn").addEventListener("click", clearChat);
  $("clear-sidebar-btn").addEventListener("click", clearChat);

  // TTS toggle
  $("tts-btn").addEventListener("click", () => {
    state.ttsEnabled = !state.ttsEnabled;
    $("tts-btn").classList.toggle("tts-on", state.ttsEnabled);
    showToast(state.ttsEnabled ? "Text-to-speech on" : "Text-to-speech off");
  });

  // Voice input
  $("voice-btn").addEventListener("click", () => {
    if (state.isRecording) stopRecording();
    else startRecording();
  });

  // Send button
  $("send-btn").addEventListener("click", () => handleSend());

  // Enter key in input
  $("msg-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Suggestion chips (empty state)
  document.addEventListener("click", e => {
    if (e.target.classList.contains("suggestion")) {
      handleSend(e.target.dataset.text);
    }
  });
}

// =====================================================================
// INIT
// =====================================================================

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  createParticles();
  setupVoice();
  attachEvents();

  // Show empty state inside messages on load
  const c = $("messages");
  if (!c.querySelector("#empty-state")) {
    c.appendChild(emptyStateEl());
  }
});
