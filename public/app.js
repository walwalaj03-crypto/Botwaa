const $ = (id) => document.getElementById(id);
let currentUser = null, products = [], activeOrder = null, pollTimer = null;
const rupiah = n => "Rp" + Number(n).toLocaleString("id-ID");
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3200); }
async function api(url, options={}) {
  const res = await fetch(url, { ...options, headers: { "Content-Type":"application/json", ...(options.headers||{}) } });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}
function show(view) { ["authView","dashboardView","ownerView"].forEach(id=>$(id).classList.toggle("hidden",id!==view)); }
function tab(name) {
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  $("loginForm").classList.toggle("hidden",name!=="login");
  $("registerForm").classList.toggle("hidden",name!=="register");
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>tab(b.dataset.tab)));
async function login() {
  try {
    const d=await api("/api/login",{method:"POST",body:JSON.stringify({email:$("loginEmail").value,password:$("loginPassword").value})});
    currentUser=d.user; await enterDashboard();
  } catch(e){toast(e.message);}
}
async function register() {
  try {
    const d=await api("/api/register",{method:"POST",body:JSON.stringify({username:$("regUsername").value,email:$("regEmail").value,password:$("regPassword").value})});
    currentUser=d.user; await enterDashboard();
  } catch(e){toast(e.message);}
}
$("loginBtn").onclick=login; $("registerBtn").onclick=register;
$("loginPassword").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
$("logoutBtn").onclick=async()=>{await api("/api/logout",{method:"POST"});currentUser=null;show("authView");toast("Kamu sudah logout.");};
async function enterDashboard(){
  $("welcomeName").textContent=currentUser.username;
  $("ownerEntry").classList.toggle("hidden",!currentUser.isOwner);
  show("dashboardView"); await renderProducts(); await loadTrial();
}
async function renderProducts(){
  $("products").innerHTML=products.map(p=>`<article class="product"><span class="pill">BOT ACCESS</span><div class="days">${p.name}</div><div class="muted tiny">${p.days} hari akses</div><div class="price">${rupiah(p.price)}</div><button class="btn primary" data-buy="${p.id}">Buy sekarang →</button></article>`).join("");
  document.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>createOrder(b.dataset.buy));
}
async function loadTrial(){
  try{
    const d=await api("/api/trial");
    if(!d.trial){$("trialBtn").disabled=false;$("trialBtn").textContent="Aktifkan Free Trial 1 Hari";$("trialInfo").textContent="Belum pernah menggunakan trial.";}
    else if(d.active){$("trialBtn").disabled=true;$("trialBtn").textContent="Trial sedang aktif";$("trialInfo").textContent="Berakhir: "+new Date(d.trial.expiresAt).toLocaleString("id-ID");}
    else{$("trialBtn").disabled=true;$("trialBtn").textContent="Trial sudah digunakan";$("trialInfo").textContent="Trial akun ini sudah berakhir.";}
  }catch(e){$("trialInfo").textContent=e.message;}
}
$("trialBtn").onclick=async()=>{try{const d=await api("/api/trial",{method:"POST"});toast("Free Trial berhasil diaktifkan!");await loadTrial();}catch(e){toast(e.message);}};
async function createOrder(productId){
  try{
    if(activeOrder && activeOrder.status==="pending"){toast("Selesaikan atau batalkan transaksi yang sedang aktif.");return;}
    const d=await api("/api/orders",{method:"POST",body:JSON.stringify({productId})});
    activeOrder=d.order; renderPayment(activeOrder); toast("QRIS berhasil dibuat.");
  }catch(e){toast(e.message);}
}
function renderPayment(o){
  const panel=$("paymentPanel");panel.classList.remove("hidden");
  panel.innerHTML=`<div class="eyebrow">CHECKOUT • ${o.orderId}</div><div class="payment-content"><div><h2>Pembayaran ${o.productName}</h2><p class="muted small">Total pembayaran: <b>${rupiah(o.total ?? o.amount)}</b></p><span class="status" id="payStatus">PENDING</span><p class="muted tiny">Scan QRIS menggunakan aplikasi pembayaran kamu. Status akan diperiksa otomatis.</p><div class="payment-actions">${o.payUrl?`<a class="btn primary" href="${o.payUrl}" target="_blank" rel="noreferrer">Buka halaman bayar ↗</a>`:""}<button class="btn ghost" id="checkPay">Cek status</button><button class="btn danger" id="cancelPay">Batalkan</button></div><p class="tiny muted" id="paymentNote">${o.expiresAt?"Kedaluwarsa: "+o.expiresAt:""}</p></div><div>${o.qrUrl?`<img class="qr" src="${o.qrUrl}" alt="QRIS pembayaran">`:`<div class="panel"><p class="muted">QR tidak disediakan API. Tekan tombol Buka halaman bayar.</p></div>`}</div></div><div id="deliveredCode"></div>`;
  $("checkPay").onclick=()=>checkPayment(o.orderId);
  $("cancelPay").onclick=()=>cancelPayment(o.orderId);
  if(pollTimer)clearInterval(pollTimer);
  pollTimer=setInterval(()=>checkPayment(o.orderId,true),7000);
  panel.scrollIntoView({behavior:"smooth",block:"center"});
}
async function checkPayment(orderId,silent=false){
  try{
    const d=await api("/api/orders/"+encodeURIComponent(orderId));
    const o=d.order; activeOrder=o;
    const status=$("payStatus"); if(status){status.textContent=o.status.toUpperCase();status.className="status "+(o.status==="paid"?"paid":["failed","expired","canceled"].includes(o.status)?"failed":"");}
    if(o.status==="paid"){
      clearInterval(pollTimer);
      $("deliveredCode").innerHTML=o.code?`<div class="panel" style="margin-top:18px"><span class="status paid">PEMBAYARAN BERHASIL</span><h2>Kode akses kamu</h2><p class="code-text">${escapeHtml(o.code)}</p><button class="btn primary" id="copyCode">Salin kode</button><p class="muted tiny">Kirim kode ini ke <b>@Hendarwabot</b> untuk aktivasi.</p></div>`:`<p class="muted">Pembayaran berhasil, tetapi stok kode paket ini habis. Hubungi owner untuk bantuan.</p>`;
      if($("copyCode"))$("copyCode").onclick=()=>navigator.clipboard.writeText(o.code).then(()=>toast("Kode berhasil disalin."));
      if(!silent)toast("Pembayaran berhasil!"+(o.code?" Kode akses sudah tersedia.":" Stok kode habis, hubungi owner."));
    }else if(["expired","canceled","failed"].includes(o.status)){clearInterval(pollTimer);if(!silent)toast("Transaksi: "+o.status);}
    else if(!silent)toast("Pembayaran masih menunggu.");
  }catch(e){if(!silent)toast(e.message);}
}
async function cancelPayment(orderId){
  try{await api("/api/orders/"+encodeURIComponent(orderId)+"/cancel",{method:"POST"});clearInterval(pollTimer);activeOrder=null;toast("Transaksi dibatalkan.");await checkPayment(orderId,true);}
  catch(e){toast(e.message);}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("ownerBtn").onclick=enterOwner;
$("backDash").onclick=()=>show("dashboardView");
async function enterOwner(){
  try{
    const [summary,codes]=await Promise.all([api("/api/owner/summary"),api("/api/owner/codes")]);
    $("stats").innerHTML=`<div class="stat"><span>Total member</span><b>${summary.users}</b></div><div class="stat"><span>Total transaksi</span><b>${summary.orders}</b></div><div class="stat"><span>Pembayaran berhasil</span><b>${summary.paid}</b></div>`;
    $("codeProduct").innerHTML=products.map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
    $("stats").innerHTML+=summary.codes.map(c=>`<div class="stat"><span>Stok ${c.name}</span><b>${c.available}</b><span>Terpakai: ${c.used}</span></div>`).join("");
    renderCodes(codes.codes);show("ownerView");
  }catch(e){toast(e.message);}
}
function renderCodes(codes){
  $("codeList").innerHTML=codes.length?codes.map(c=>`<div class="code-row"><div><div class="code-text">${escapeHtml(c.code)}</div><div class="code-meta">${escapeHtml(products.find(p=>p.id===c.productId)?.name||c.productId)} • ${c.usedAt?"Sudah digunakan":"Tersedia"}</div></div>${c.usedAt?'<span class="status paid">USED</span>':`<button class="btn danger" data-delete="${c.id}">Hapus</button>`}</div>`).join(""):'<p class="muted small">Belum ada kode. Tambahkan stok untuk setiap paket.</p>';
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{try{await api("/api/owner/codes/"+b.dataset.delete,{method:"DELETE"});toast("Kode dihapus.");await enterOwner();}catch(e){toast(e.message);}});
}
$("addCodeBtn").onclick=async()=>{
  try{await api("/api/owner/codes",{method:"POST",body:JSON.stringify({productId:$("codeProduct").value,code:$("codeValue").value})});$("codeValue").value="";toast("Kode berhasil ditambahkan.");await enterOwner();}
  catch(e){toast(e.message);}
};
$("refreshCodes").onclick=enterOwner;
async function init(){
  $("year").textContent=new Date().getFullYear();
  try{const d=await api("/api/config");products=d.products;const me=await api("/api/me");currentUser=me.user;await enterDashboard();}
  catch{show("authView");}
}
init();
