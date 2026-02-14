(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function showError(msg){
    const note = $("loadNote");
    if(note) note.textContent = msg;
    console.error(msg);
  }

  window.addEventListener("error", (e) => showError("Runtime error: " + (e.message || e)));
  window.addEventListener("unhandledrejection", (e) => showError("Promise rejection: " + (e.reason?.message || e.reason || "unknown")));

  const LS = {
    key: "uai.key",
    model: "uai.model",
    dark: "uai.dark",
    chats: "uai.chats"
  };

  const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

  let apiKey = localStorage.getItem(LS.key) || "";
  let model  = localStorage.getItem(LS.model) || "deepseek/deepseek-r1:free";
  let dark   = (localStorage.getItem(LS.dark) || "0") === "1";
  let chats  = JSON.parse(localStorage.getItem(LS.chats) || "[]");
  if(!Array.isArray(chats)) chats = [];
  if(!chats.length) chats = [{ id: Date.now(), messages: [] }];

  let active = chats[0];

  function persist(){
    localStorage.setItem(LS.key, apiKey);
    localStorage.setItem(LS.model, model);
    localStorage.setItem(LS.dark, dark ? "1":"0");
    localStorage.setItem(LS.chats, JSON.stringify(chats));
  }

  function applyDark(){
    document.documentElement.classList.toggle("dark", dark);
  }

  function setStatus(s){ const el=$("status"); if(el) el.textContent = s || ""; }

  function render(){
    const box = $("messages");
    if(!box) return;
    box.innerHTML = "";
    active.messages.forEach(m => {
      const wrap = document.createElement("div");
      wrap.className = "flex " + (m.role === "user" ? "justify-end":"justify-start");
      const b = document.createElement("div");
      b.className = "max-w-[85%] px-4 py-2 rounded-2xl border text-sm " +
        (m.role === "user"
          ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
          : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800");
      const html = window.marked ? window.marked.parse(m.content || "") : (m.content || "");
      b.innerHTML = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,"");
      wrap.appendChild(b);
      box.appendChild(wrap);
    });
    box.scrollTop = box.scrollHeight;
  }

  async function send(){
    const ta = $("prompt");
    const text = (ta?.value || "").trim();
    if(!text) return;
    active.messages.push({ role:"user", content:text });
    ta.value = "";
    render();
    persist();

    if(!apiKey){
      setStatus("Add OpenRouter key in Settings (⚙).");
      $("settingsModal")?.classList.remove("hidden");
      return;
    }

    setStatus("Streaming...");
    active.messages.push({ role:"assistant", content:"" });
    render();

    const payload = {
      model,
      stream: true,
      messages: active.messages.filter(x => x.role==="user" || x.role==="assistant").map(x => ({role:x.role, content:x.content}))
    };

    try{
      const res = await fetch(OPENROUTER, {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":"Bearer " + apiKey,
          "HTTP-Referer": location.origin || "http://localhost",
          "X-Title":"Universal AI Chat"
        },
        body: JSON.stringify(payload)
      });

      if(!res.ok || !res.body){
        const t = await res.text().catch(()=> "");
        throw new Error("OpenRouter error " + res.status + ": " + (t || res.statusText));
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder("utf-8");
      let buf = "";
      let full = "";

      while(true){
        const {value, done} = await reader.read();
        if(done) break;
        buf += dec.decode(value, {stream:true});
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for(const lineRaw of lines){
          const line = lineRaw.trim();
          if(!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if(!data) continue;
          if(data === "[DONE]") break;
          let j;
          try{ j = JSON.parse(data); }catch{ continue; }
          const delta = j?.choices?.[0]?.delta?.content;
          if(typeof delta === "string" && delta){
            full += delta;
            active.messages[active.messages.length-1].content = full;
            render();
          }
        }
      }

      setStatus("Done.");
      persist();
    }catch(err){
      setStatus(err.message || "Unknown error");
      console.error(err);
    }
  }

  function boot(){
    applyDark();

    // show app + hide loader
    $("loading")?.remove();
    $("app")?.classList.remove("hidden");

    // bind
    $("send")?.addEventListener("click", send);
    $("prompt")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); }});

    $("openSettings")?.addEventListener("click", ()=>{
      $("apiKey").value = apiKey;
      $("model").value = model;
      $("settingsModal")?.classList.remove("hidden");
    });

    $("closeSettings")?.addEventListener("click", ()=> $("settingsModal")?.classList.add("hidden"));

    $("saveSettings")?.addEventListener("click", ()=>{
      apiKey = ($("apiKey").value || "").trim();
      model  = ($("model").value || "").trim() || "deepseek/deepseek-r1:free";
      persist();
      $("settingsModal")?.classList.add("hidden");
      setStatus("Saved.");
    });

    $("toggleDark")?.addEventListener("click", ()=>{
      dark = !dark;
      applyDark();
      persist();
    });

    render();
    setStatus(apiKey ? "Ready." : "Add API key in Settings.");
  }

  // If marked/tailwind failed, still boot
  try { boot(); } catch(e){ showError("Boot error: " + (e.message||e)); }
})();
