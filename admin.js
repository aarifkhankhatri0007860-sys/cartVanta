
import { API_BASE } from "./database-config.js";

const $ = id => document.getElementById(id);

let token = localStorage.getItem("cv_admin_token") || "";
let products = [];
let categories = [];
let orders = [];
let customers = [];
let page = "dashboard";

const money = v => "₹" + Number(v || 0).toLocaleString("en-IN");

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const stamp = v => v ? new Date(v).toLocaleString("en-IN") : "—";

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (token) headers.Authorization = "Bearer " + token;

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const r = await fetch(API_BASE + path, {
    ...options,
    headers
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data.error || "Request failed (" + r.status + ")");
  }

  return data;
}

function note(t, type = "") {
  const n = $("notice");
  n.textContent = t;
  n.className = "notice " + type;
  n.classList.remove("hidden");
}

function showLogin(msg = "") {
  $("loginView").classList.remove("hidden");
  $("appView").classList.add("hidden");

  if (msg) {
    $("loginMsg").textContent = msg;
    $("loginMsg").classList.remove("hidden");
  }
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
}

$("loginBtn").onclick = async () => {
  const b = $("loginBtn");
  b.disabled = true;

  try {
    const d = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("email").value.trim(),
        password: $("password").value
      })
    });

    token = d.token;
    localStorage.setItem("cv_admin_token", token);

    showApp();
    await refresh();

  } catch (e) {
    $("loginMsg").textContent = e.message;
    $("loginMsg").classList.remove("hidden");

  } finally {
    b.disabled = false;
  }
};

$("logoutBtn").onclick = () => {
  token = "";
  localStorage.removeItem("cv_admin_token");
  showLogin();
};

$("closeModal").onclick = () => {
  $("modal").classList.add("hidden");
};

document.querySelectorAll(".navbtn").forEach(b => {
  b.onclick = () => navigate(b.dataset.page);
});

function navigate(p) {
  page = p;

  document.querySelectorAll(".navbtn").forEach(b => {
    b.classList.toggle("active", b.dataset.page === p);
  });

  ["dashboard", "products", "categories", "orders", "customers"].forEach(x => {
    $(x + "Page").classList.toggle("hidden", x !== p);
  });

  const titles = {
    dashboard: ["Dashboard", "Your store at a glance"],
    products: ["Products", "Manage your own inventory"],
    categories: ["Categories", "Organise your catalogue"],
    orders: ["Orders & CRM", "Customer orders and fulfilment"],
    customers: ["Customers", "Customer records and history"]
  };

  $("pageTitle").textContent = titles[p][0];
  $("pageSub").textContent = titles[p][1];

  render();
}

async function refresh() {
  try {
    const [p, c, o, u] = await Promise.all([
      api("/api/admin/products"),
      api("/api/admin/categories"),
      api("/api/admin/orders"),
      api("/api/admin/customers")
    ]);

    products = p;
    categories = c;
    orders = o;
    customers = u;

    render();

  } catch (e) {
    if (/sign in|session/i.test(e.message)) {
      token = "";
      localStorage.removeItem("cv_admin_token");
      showLogin(e.message);
    } else {
      note(e.message, "error");
    }
  }
}

function render() {
  if (page === "dashboard") renderDashboard();
  if (page === "products") renderProducts();
  if (page === "categories") renderCategories();
  if (page === "orders") renderOrders();
  if (page === "customers") renderCustomers();
}

/* DASHBOARD */

function renderDashboard() {
  const units = products.reduce(
    (sum, p) => sum + Number(p.stock || 0), 0
  );

  const rev = orders
    .filter(o => o.payment_status === "paid")
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  const low = products.filter(
    p => Number(p.stock || 0) <= 5
  );

  const lowStockHtml = low.length
    ? table(
        ["Product", "SKU", "Stock"],
        low.map(p => [esc(p.name), esc(p.sku), p.stock])
      )
    : '<div class="empty">No low stock alerts.</div>';

  $("dashboardPage").innerHTML =
    '<div class="cards">' +
      '<div class="stat"><small>Total products</small><strong>' +
      products.length +
      '</strong><em>Catalogue items</em></div>' +

      '<div class="stat"><small>Stock units</small><strong>' +
      units +
      '</strong><em>Physical inventory</em></div>' +

      '<div class="stat"><small>Orders</small><strong>' +
      orders.length +
      '</strong><em>All statuses</em></div>' +

      '<div class="stat"><small>Paid order total</small><strong>' +
      money(rev) +
      '</strong><em>Paid orders only</em></div>' +
    '</div>' +

    '<div class="panel">' +
      '<div class="panel-head"><h2>Low stock alerts</h2>' +
      '<button class="btn secondary" onclick="window.cvNav(\'products\')">Manage products</button></div>' +
      lowStockHtml +
    '</div>' +

    '<div class="panel">' +
      '<div class="panel-head"><h2>Recent orders</h2>' +
      '<button class="btn secondary" onclick="window.cvNav(\'orders\')">Open CRM</button></div>' +
      orderTable(orders.slice(0, 8)) +
    '</div>' +

    '<div class="panel">' +
      '<button class="btn secondary" id="backupBtn">Download database backup (.db)</button>' +
    '</div>';

  $("backupBtn").onclick = backup;
}

/* TABLES */

function table(head, rows) {
  return '<div class="tablewrap"><table><thead><tr>' +
    head.map(x => '<th>' + x + '</th>').join("") +
    '</tr></thead><tbody>' +
    rows.map(r => '<tr>' +
      r.map(x => '<td>' + x + '</td>').join("") +
    '</tr>').join("") +
    '</tbody></table></div>';
}

function orderTable(list) {
  return list.length
    ? table(
        ["Order", "Customer", "Total", "Payment", "Status", "Date"],
        list.map(o => [
          esc(o.order_number),
          esc(o.customer_name),
          money(o.total),
          esc(o.payment_status),
          esc(o.status),
          stamp(o.created_at)
        ])
      )
    : '<div class="empty">No orders yet.</div>';
}

/* PRODUCTS */

function renderProducts() {
  $("productsPage").innerHTML =
    '<div class="panel">' +
      '<div class="panel-head"><h2>Product catalogue (' +
      products.length +
      ')</h2><button class="btn" id="addProduct">+ Add product</button></div>' +
      '<div class="toolbar">' +
        '<input class="field" id="productSearch" placeholder="Search name or SKU">' +
        '<select class="field" id="productFilter">' +
          '<option value="">All visibility</option>' +
          '<option value="published">Published</option>' +
          '<option value="draft">Draft</option>' +
        '</select>' +
      '</div>' +
      '<div id="productTable"></div>' +
    '</div>';

  $("addProduct").onclick = () => productForm();
  $("productSearch").oninput = filterProducts;
  $("productFilter").onchange = filterProducts;

  filterProducts();
}

function filterProducts() {
  const q = ($("productSearch")?.value || "").toLowerCase();
  const f = $("productFilter")?.value || "";

  const list = products.filter(p =>
    (!f || p.status === f) &&
    ((p.name + " " + p.sku).toLowerCase().includes(q))
  );

  $("productTable").innerHTML = list.length
    ? table(
        ["Product", "SKU", "Category", "Price", "Stock", "Status", "Actions"],
        list.map(p => [
          (p.images?.[0]
            ? '<img class="thumb" src="' + esc(API_BASE + p.images[0]) + '">'
            : "") + esc(p.name),
          esc(p.sku),
          esc(p.categoryName || "—"),
          money(p.price),
          p.stock,
          esc(p.status),
          '<button class="btn secondary" data-edit="' + p.id + '">Edit</button> ' +
          '<button class="btn danger" data-del="' + p.id + '">Delete</button>'
        ])
      )
    : '<div class="empty">No products found.</div>';

  document.querySelectorAll("[data-edit]").forEach(b => {
    b.onclick = () => productForm(
      products.find(p => p.id === b.dataset.edit)
    );
  });

  document.querySelectorAll("[data-del]").forEach(b => {
    b.onclick = () => deleteProduct(b.dataset.del);
  });
}

async function productForm(p = {}) {
  const edit = !!p.id;

  $("modalTitle").textContent = edit ? "Edit product" : "Add product";

  $("modalBody").innerHTML =
    '<div class="formgrid">' +

    '<div class="group"><label>Product name *</label>' +
    '<input id="fName" class="field" value="' + esc(p.name) + '"></div>' +

    '<div class="group"><label>SKU</label>' +
    '<input id="fSku" class="field" value="' + esc(p.sku) + '"></div>' +

    '<div class="group"><label>Category</label><select id="fCat" class="field">' +
    '<option value="">Uncategorised</option>' +
    categories.map(c =>
      '<option value="' + c.id + '" ' +
      (p.categoryId === c.id ? "selected" : "") + '>' +
      esc(c.name) + '</option>'
    ).join("") +
    '</select></div>' +

    '<div class="group"><label>Brand</label>' +
    '<input id="fBrand" class="field" value="' + esc(p.brand) + '"></div>' +

    '<div class="group"><label>Cost ₹</label>' +
    '<input id="fCost" class="field" type="number" min="0" value="' +
    (p.cost || 0) + '"></div>' +

    '<div class="group"><label>Selling price ₹ *</label>' +
    '<input id="fPrice" class="field" type="number" min="0" value="' +
    (p.price ?? "") + '"></div>' +

    '<div class="group"><label>MRP ₹</label>' +
    '<input id="fMrp" class="field" type="number" min="0" value="' +
    (p.mrp || 0) + '"></div>' +

    '<div class="group"><label>Stock quantity *</label>' +
    '<input id="fStock" class="field" type="number" min="0" step="1" value="' +
    (p.stock ?? 0) + '"></div>' +

    '<div class="group full"><label>Description</label>' +
    '<textarea id="fDesc" class="field">' + esc(p.description) +
    '</textarea></div>' +

    '<div class="group full"><label>Tags (comma separated)</label>' +
    '<input id="fTags" class="field" value="' +
    esc((p.tags || []).join(", ")) + '"></div>' +

    '<div class="group"><label>Visibility</label><select id="fStatus" class="field">' +
    '<option value="draft" ' + (p.status !== "published" ? "selected" : "") +
    '>Draft</option>' +
    '<option value="published" ' + (p.status === "published" ? "selected" : "") +
    '>Published</option>' +
    '</select></div>' +

    '<div class="group"><label>Product photos (JPG, PNG, WEBP, AVIF; max 5 MB each)</label>' +
    '<input id="fImages" class="field" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple></div>' +

    '</div>' +

    '<div class="photo-row">' +
    (p.images || []).map(u =>
      '<img class="preview" src="' + esc(API_BASE + u) + '">'
    ).join("") +
    '</div>' +

    '<div class="actions">' +
      '<button class="btn" id="saveProduct">Save product</button>' +
      '<button class="btn secondary" id="cancelProduct">Cancel</button>' +
    '</div>';

  $("modal").classList.remove("hidden");

  $("cancelProduct").onclick = () => {
    $("modal").classList.add("hidden");
  };

  $("saveProduct").onclick = async () => {
    const b = $("saveProduct");
    b.disabled = true;

    try {
      const data = {
        name: $("fName").value.trim(),
        sku: $("fSku").value.trim(),
        categoryId: $("fCat").value || null,
        brand: $("fBrand").value,
        cost: Number($("fCost").value || 0),
        price: Number($("fPrice").value),
        mrp: Number($("fMrp").value || 0),
        stock: Number($("fStock").value),
        description: $("fDesc").value,
        tags: $("fTags").value.split(",").map(x => x.trim()).filter(Boolean),
        status: $("fStatus").value
      };

      const saved = edit
        ? await api("/api/admin/products/" + p.id, {
            method: "PUT",
            body: JSON.stringify(data)
          })
        : await api("/api/admin/products", {
            method: "POST",
            body: JSON.stringify(data)
          });

      const productId = edit ? p.id : saved.id;

      if ($("fImages").files.length) {
        const fd = new FormData();

        [...$("fImages").files].forEach(f => {
          fd.append("images", f);
        });

        await api("/api/admin/products/" + productId + "/images", {
          method: "POST",
          body: fd
        });
      }

      note("Product saved successfully.", "success");
      $("modal").classList.add("hidden");

      await refresh();

    } catch (e) {
      note(e.message, "error");

    } finally {
      b.disabled = false;
    }
  };
}

async function deleteProduct(id) {
  if (!confirm("Delete this product and its stored images?")) return;

  try {
    await api("/api/admin/products/" + id, {
      method: "DELETE"
    });

    await refresh();
    note("Product deleted.", "success");

  } catch (e) {
    note(e.message, "error");
  }
}

/* CATEGORIES */

function renderCategories() {
  $("categoriesPage").innerHTML =
    '<div class="panel">' +
      '<div class="panel-head"><h2>Categories</h2></div>' +
      '<div class="toolbar">' +
        '<input id="catName" class="field" placeholder="New category name">' +
        '<button id="addCat" class="btn">Add category</button>' +
      '</div>' +
      '<div id="catTable"></div>' +
    '</div>';

  $("addCat").onclick = addCategory;

  $("catTable").innerHTML = categories.length
    ? table(
        ["Category", "Status", "Actions"],
        categories.map(c => [
          esc(c.name),
          esc(c.status),
          '<button class="btn secondary" data-toggle="' + c.id + '">' +
          (c.status === "active" ? "Hide" : "Activate") +
          '</button> <button class="btn danger" data-catdel="' +
          c.id + '">Delete</button>'
        ])
      )
    : '<div class="empty">No categories created.</div>';

  document.querySelectorAll("[data-toggle]").forEach(b => {
    b.onclick = () => toggleCategory(b.dataset.toggle);
  });

  document.querySelectorAll("[data-catdel]").forEach(b => {
    b.onclick = () => removeCategory(b.dataset.catdel);
  });
}

async function addCategory() {
  const name = $("catName").value.trim();
  if (!name) return;

  try {
    await api("/api/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name })
    });

    await refresh();

  } catch (e) {
    note(e.message, "error");
  }
}

async function toggleCategory(id) {
  const c = categories.find(x => x.id === id);
  if (!c) return;

  try {
    await api("/api/admin/categories/" + id, {
      method: "PUT",
      body: JSON.stringify({
        name: c.name,
        status: c.status === "active" ? "hidden" : "active"
      })
    });

    await refresh();

  } catch (e) {
    note(e.message, "error");
  }
}

async function removeCategory(id) {
  if (!confirm("Delete this category? Products will remain uncategorised.")) return;

  try {
    await api("/api/admin/categories/" + id, {
      method: "DELETE"
    });

    await refresh();

  } catch (e) {
    note(e.message, "error");
  }
}

/* ORDERS & CRM */

function renderOrders() {
  $("ordersPage").innerHTML =
    '<div class="panel">' +
      '<div class="panel-head"><h2>Orders (' + orders.length +
      ')</h2><button class="btn secondary" id="refreshOrders">Refresh</button></div>' +
      '<div id="orderRows">' +

      (orders.length
        ? orders.map(o =>
          '<div class="panel">' +
            '<div class="panel-head">' +
              '<div><b>' + esc(o.order_number) + '</b>' +
              '<div class="muted">' + esc(o.customer_name) + ' · ' +
              esc(o.phone) + ' · ' + stamp(o.created_at) + '</div></div>' +
              '<b>' + money(o.total) + '</b>' +
            '</div>' +

            '<div class="muted">' + esc(o.address) + '</div>' +

            '<p class="muted">' +
            (o.items || []).map(i =>
              esc(i.name) + ' × ' + i.quantity
            ).join(" · ") +
            '</p>' +

            '<div class="formgrid">' +

              '<div class="group"><label>Order status</label>' +
              '<select class="field" id="os-' + o.id + '">' +
              ["new", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled", "returned"]
                .map(s => '<option ' + (o.status === s ? "selected" : "") + '>' + s + '</option>')
                .join("") +
              '</select></div>' +

              '<div class="group"><label>Payment status</label>' +
              '<select class="field" id="op-' + o.id + '">' +
              ["pending", "paid", "failed", "refunded", "cod_due"]
                .map(s => '<option ' + (o.payment_status === s ? "selected" : "") + '>' + s + '</option>')
                .join("") +
              '</select></div>' +

              '<div class="group full"><label>Internal remark</label>' +
              '<input class="field" id="or-' + o.id + '" value="' +
              esc(o.admin_remark) + '"></div>' +

            '</div>' +

            '<div class="actions">' +
              '<button class="btn" data-order="' + o.id + '">Save order update</button>' +
            '</div>' +
          '</div>'
        ).join("")
        : '<div class="empty">No orders yet.</div>') +

      '</div>' +
    '</div>';

  $("refreshOrders").onclick = refresh;

  document.querySelectorAll("[data-order]").forEach(b => {
    b.onclick = () => updateOrder(b.dataset.order);
  });
}

async function updateOrder(id) {
  try {
    await api("/api/admin/orders/" + id, {
      method: "PATCH",
      body: JSON.stringify({
        status: $("os-" + id).value,
        paymentStatus: $("op-" + id).value,
        adminRemark: $("or-" + id).value
      })
    });

    await refresh();
    note("Order updated.", "success");

  } catch (e) {
    note(e.message, "error");
  }
}

/* CUSTOMERS */

function renderCustomers() {
  $("customersPage").innerHTML =
    '<div class="panel">' +
      '<div class="panel-head"><h2>Customers (' +
      customers.length + ')</h2></div>' +

      (customers.length
        ? table(
            ["Name", "Phone", "Email", "Orders", "Paid total", "Joined"],
            customers.map(c => [
              esc(c.name),
              esc(c.phone),
              esc(c.email || "—"),
              c.order_count,
              money(c.paid_total),
              stamp(c.created_at)
            ])
          )
        : '<div class="empty">No customers yet.</div>') +

    '</div>';
}

/* DATABASE BACKUP */

async function backup() {
  try {
    const r = await fetch(API_BASE + "/api/admin/backup", {
      headers: {
        Authorization: "Bearer " + token
      }
    });

    if (!r.ok) throw new Error("Backup download failed");

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "cartvanta-backup.db";
    a.click();

    URL.revokeObjectURL(url);

  } catch (e) {
    note(e.message, "error");
  }
}

/* GLOBAL NAVIGATION */

window.cvNav = navigate;

/* INITIAL LOAD */

if (token) {
  try {
    await api("/api/auth/me");
    showApp();
    await refresh();

  } catch {
    token = "";
    localStorage.removeItem("cv_admin_token");
    showLogin();
  }

} else {
  showLogin();
}
