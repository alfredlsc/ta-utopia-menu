/************** State **************/
let cart = [];
const WA_NUMBER = "60165368285"; // 不带+号

// users 存在 localStorage：{ [phone]: {name, phone, points:number} }
let currentUser = null;

/************** Helpers **************/
function loadUsers() {
  return JSON.parse(localStorage.getItem("ta_users") || "{}");
}
function saveUsers(users) {
  localStorage.setItem("ta_users", JSON.stringify(users));
}
function setCurrentUser(user) {
  currentUser = user;
  if (user) localStorage.setItem("ta_current_phone", user.phone);
  else localStorage.removeItem("ta_current_phone");
  updateAccountUI();
  updateRedeemUI();
  renderCart();
}
function loadCurrentUser() {
  const users = loadUsers();
  const phone = localStorage.getItem("ta_current_phone");
  currentUser = phone && users[phone] ? users[phone] : null;
}

function subtotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}
// 规则：消费 RM1 = 1 分
function orderPoints(amount) {
  return Math.floor(amount);
}
// 规则：10 分 = RM1 抵扣
function discountFromPoints(pointsToUse) {
  return pointsToUse / 10;
}

/************** Menu & Cart **************/
function renderCart() {
  const cartItemsDiv = document.getElementById("cart-items");
  cartItemsDiv.innerHTML = "";

  let sub = 0;
  cart.forEach((item) => {
    sub += item.price * item.qty;
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div class="cart-item-name">${item.name} x ${item.qty}</div>
      <div>RM ${(item.price * item.qty).toFixed(2)}</div>
    `;
    cartItemsDiv.appendChild(row);
  });

  // 小计
  document.getElementById("cart-subtotal").innerText = `RM ${sub.toFixed(2)}`;

  // 本单可获积分（按实付金额计算，显示暂时放这里，结算时会重算）
  document.getElementById("cart-points").innerText = orderPoints(sub);

  // 右上角数量徽章
  document.getElementById("cart-count").innerText = cart.reduce((s, i) => s + i.qty, 0);

  // 顶部积分显示：登录则显示会员当前可用积分，否则 0
  document.getElementById("points-display").innerText =
    `TA POINTS: ${currentUser ? (currentUser.points || 0) : 0}`;

  // 应用使用积分后的折扣显示
  applyRedeemUI();
}

function addToCart(name, price) {
  const exist = cart.find(i => i.name === name);
  if (exist) exist.qty += 1;
  else cart.push({ name, price, qty: 1 });

  renderCart();
  document.getElementById("cart-sidebar").classList.remove("cart-hidden");
}

function clearCart() {
  cart = [];
  renderCart();
}

/************** Redeem (use points) **************/
function updateRedeemUI() {
  const area = document.getElementById("redeem-area");
  if (!area) return;
  if (currentUser) {
    area.style.display = "";
    document.getElementById("available-points").innerText = currentUser.points || 0;
    const useInput = document.getElementById("use-points");
    if (useInput) {
      useInput.value = "0";
      useInput.max = currentUser.points || 0;
    }
  } else {
    area.style.display = "none";
  }
}

function applyRedeemUI() {
  const discountRow = document.getElementById("discount-row");
  const discountEl = document.getElementById("cart-discount");
  const sub = subtotal();

  if (!currentUser) {
    if (discountRow) discountRow.style.display = "none";
    return;
  }
  const useInput = document.getElementById("use-points");
  if (!useInput) return;

  let use = parseInt(useInput.value || "0", 10);
  if (isNaN(use) || use < 0) use = 0;

  const available = currentUser.points || 0;
  if (use > available) use = available;

  // 不可超过小计所能抵扣的上限：需要 points <= sub*10
  const maxBySubtotal = Math.floor(sub * 10);
  if (use > maxBySubtotal) use = maxBySubtotal;

  // 回写修正后的值
  if (useInput.value !== String(use)) useInput.value = String(use);

  const discount = discountFromPoints(use);
  if (discount > 0) {
    discountRow.style.display = "";
    discountEl.innerText = `RM ${discount.toFixed(2)}`;
  } else {
    discountRow.style.display = "none";
    discountEl.innerText = "RM 0";
  }
}

/************** WhatsApp Order **************/
function orderWhatsApp() {
  if (cart.length === 0) {
    alert("Your cart is empty!");
    return;
  }

  const nameInput = document.getElementById("cust-name");
  const phoneInput = document.getElementById("cust-phone");
  const name = (nameInput.value || "").trim();
  const phone = (phoneInput.value || "").trim();

  if (!name) { alert("Please enter your name."); return; }
  if (!phone) { alert("Please enter your phone number."); return; }

  // 记住顾客信息（下单区）
  localStorage.setItem("ta_cust_name", name);
  localStorage.setItem("ta_cust_phone", phone);
  localStorage.setItem("ta_tip_seen", "1");

  // 计算金额、折扣、实付、得分
  const sub = subtotal();
  const use = currentUser ? Math.min(
    parseInt(document.getElementById("use-points").value || "0", 10) || 0,
    (currentUser.points || 0),
    Math.floor(sub * 10)
  ) : 0;
  const discount = discountFromPoints(use);
  const payable = Math.max(0, sub - discount);
  const earn = orderPoints(payable); // 实付金额获取积分

  // 组装 WhatsApp 信息
  let msg = "🩷 TA UTOPIA ORDER 🩷%0A%0A";
  cart.forEach(it => {
    msg += `${it.name} x ${it.qty} = RM ${(it.price * it.qty).toFixed(2)}%0A`;
  });
  msg += `%0ASubtotal: RM ${sub.toFixed(2)}%0A`;
  if (currentUser && use > 0) {
    msg += `Points Used: ${use} (Discount RM ${discount.toFixed(2)})%0A`;
  }
  msg += `Total Payable: RM ${payable.toFixed(2)}%0A`;
  msg += `TA POINTS (earn): ${earn}%0A%0A`;
  msg += `Name: ${encodeURIComponent(name)}%0A`;
  msg += `Phone: ${encodeURIComponent(phone)}`;

  window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`, "_blank");

  // ===== 更新会员积分（扣用＋加赚）=====
  if (currentUser) {
    const users = loadUsers();
    const u = users[currentUser.phone] || { name: currentUser.name, phone: currentUser.phone, points: 0 };
    u.points = Math.max(0, (u.points || 0) - use) + earn;
    users[currentUser.phone] = u;
    saveUsers(users);
    setCurrentUser(u); // 刷新 UI
  }

  // 清空购物车
  cart = [];
  renderCart();
}

/************** Account (Sign In / Register) **************/
function openAccountModal() {
  document.getElementById("account-modal").style.display = "flex";
  document.getElementById("acc-name").value = currentUser?.name || "";
  document.getElementById("acc-phone").value = currentUser?.phone || "";
}
function closeAccountModal() {
  document.getElementById("account-modal").style.display = "none";
}
function saveAccount() {
  const name = (document.getElementById("acc-name").value || "").trim();
  const phone = (document.getElementById("acc-phone").value || "").trim();
  if (!name) { alert("Please enter your name."); return; }
  if (!phone) { alert("Please enter your phone number."); return; }

  const users = loadUsers();
  if (users[phone]) {
    users[phone].name = name; // 允许改名
  } else {
    users[phone] = { name, phone, points: 0 };
  }
  saveUsers(users);
  setCurrentUser(users[phone]);
  closeAccountModal();

  // 同步下单区字段
  document.getElementById("cust-name").value = name;
  document.getElementById("cust-phone").value = phone;
}
function updateAccountUI() {
  const btn = document.getElementById("account-btn");
  btn.textContent = currentUser ? `${currentUser.name}` : "Sign In";
}

/************** Init **************/
document.addEventListener("DOMContentLoaded", () => {
  // 绑定菜单卡片按钮
  document.querySelectorAll(".menu-item").forEach(card => {
    const btn = card.querySelector(".add-btn");
    if (!btn) return;
    const name = card.getAttribute("data-name");
    const price = parseFloat(card.getAttribute("data-price"));
    if (name && !isNaN(price)) {
      btn.addEventListener("click", () => addToCart(name, price));
    }
  });

  // 购物车显隐
  document.getElementById("cart-btn").addEventListener("click", () => {
    document.getElementById("cart-sidebar").classList.remove("cart-hidden");
  });
  document.getElementById("close-cart").addEventListener("click", () => {
    document.getElementById("cart-sidebar").classList.add("cart-hidden");
  });

  // 下单 / 清空
  document.getElementById("whatsapp-order").addEventListener("click", orderWhatsApp);
  document.getElementById("clear-cart").addEventListener("click", clearCart);

  // 登录弹窗
  document.getElementById("account-btn").addEventListener("click", openAccountModal);
  document.getElementById("account-cancel").addEventListener("click", closeAccountModal);
  document.getElementById("account-save").addEventListener("click", saveAccount);

  // 监听“使用积分”输入变化
  const useInput = document.getElementById("use-points");
  if (useInput) useInput.addEventListener("input", applyRedeemUI);

  // 下单区自动填充
  document.getElementById("cust-name").value = localStorage.getItem("ta_cust_name") || "";
  document.getElementById("cust-phone").value = localStorage.getItem("ta_cust_phone") || "";
  if (localStorage.getItem("ta_tip_seen")) {
    const tip = document.getElementById("remember-tip");
    if (tip) tip.style.display = "none";
  }

  // 加载当前登录
  loadCurrentUser();
  updateAccountUI();
  updateRedeemUI();

  // 首次渲染
  renderCart();
});
